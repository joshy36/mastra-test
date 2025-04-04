import { Step, Workflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { pubMedResearchAgent } from '../agents/pubMedResearchAgent';

interface Resp {
  parsedQuery: {
    rawTerms: any;
    keyTerms: any;
  };
  note: any;
}

const generateMeshTerms = new Step({
  id: 'generateMeshTerms',
  execute: async ({ context }) => {
    const agentResponse = await pubMedResearchAgent.generate([
      { role: 'user', content: context.triggerData.query },
    ]);

    const jsonString = agentResponse.steps[0].text
      .replace(/```json\s*/, '')
      .replace(/\s*```/, '')
      .trim();

    const result = JSON.parse(jsonString) as Resp;

    return {
      parsedQuery: result.parsedQuery,
      note: result.note || null,
    };
  },
});

const fetchArticles = new Step({
  id: 'fetchArticles',
  execute: async ({ context }) => {
    if (context.steps.generateMeshTerms.status !== 'success') {
      return { articles: [] };
    }
    const { keyTerms } = (
      context.steps.generateMeshTerms as {
        status: 'success';
        output: { parsedQuery: { keyTerms: string[] } };
      }
    ).output.parsedQuery;
    if (!keyTerms.length) {
      return { articles: [] };
    }

    const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
    const query = keyTerms.map((term) => `${term}[mesh]`).join(' AND ');
    const searchUrl = `${baseUrl}esearch.fcgi?db=pmc&term=${encodeURIComponent(query)}&retmax=10&retmode=json`;

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      console.error(`ESearch failed: ${searchResponse.statusText}`);
      return { articles: [] };
    }
    const searchData = await searchResponse.json();

    const pmcids = searchData.esearchresult?.idlist || [];
    if (!pmcids.length) {
      console.log('No PMCIDs found for query:', query);
      return { articles: [] };
    }

    const formattedPmcids = pmcids;
    const summaryUrl = `${baseUrl}esummary.fcgi?db=pmc&id=${formattedPmcids.join(',')}&retmode=json`;
    const summaryResponse = await fetch(summaryUrl);
    if (!summaryResponse.ok) {
      console.error(`ESummary failed: ${summaryResponse.statusText}`);
      return { articles: [] };
    }
    const summaryData = await summaryResponse.json();

    const articles = Object.values(summaryData.result || {})
      .filter((item: any) => item.uid)
      .map((item: any) => {
        const pmcid = item.uid;
        return {
          pmid:
            item.articleids?.find((id: any) => id.idtype === 'pmid')?.value ||
            'Unknown',
          pmcid,
          title: item.title || 'No title available',
          authors: item.authors?.map((a: any) => a.name) || ['Unknown'],
          journal: item.fulljournalname || item.source || 'Unknown',
          pubDate:
            item.pubdate || item.epubdate || item.printpubdate || 'Unknown',
          fullTextUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`,
        };
      });

    return { articles };
  },
});

const fetchFullArticles = new Step({
  id: 'fetchFullArticles',
  execute: async ({ context }) => {
    const baseUrl =
      'https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_xml/';

    const results = [];

    for (let article of context.steps.fetchArticles.output.articles) {
      try {
        console.log(`Fetching: ${article.fullTextUrl}`);
        const pmcId = 'PMC' + article.fullTextUrl.match(/articles\/(\d+)/)[1];
        const apiUrl = `${baseUrl}${pmcId}/unicode`;

        // Fetch the article
        const searchResponse = await fetch(apiUrl);

        if (!searchResponse.ok) {
          throw new Error(`HTTP error! status: ${searchResponse.status}`);
        }

        // Get the XML text from the response
        const xmlText = await searchResponse.text();

        // Store the result
        results.push({
          pmcId: pmcId,
          url: apiUrl,
          xmlContent: xmlText,
          success: true,
        });

        console.log(`Successfully fetched ${pmcId}`);
        // Optionally log a preview of the content
        console.log(`Content preview: ${xmlText.substring(0, 200)}...`);
      } catch (error) {
        console.error(`Error fetching ${article.fullTextUrl}`);
      }
    }
  },
});

const structureResponse = new Step({
  id: 'structureResponse',
  execute: async ({ context }) => {
    if (context.steps.fetchArticles.status !== 'success') {
      return {
        parsedQuery: (
          context.steps.generateMeshTerms as {
            status: 'success';
            output: { parsedQuery: any };
          }
        ).output?.parsedQuery || { rawTerms: [], keyTerms: [] },
        articles: [],
        timestamp: new Date().toISOString(),
        note:
          (
            context.steps.generateMeshTerms as {
              status: 'success';
              output: { note: string };
            }
          ).output?.note || 'Step failed',
      };
    }

    return {
      parsedQuery: (
        context.steps.generateMeshTerms as {
          status: 'success';
          output: { parsedQuery: any };
        }
      ).output.parsedQuery,
      articles: (
        context.steps.fetchArticles as {
          status: 'success';
          output: { articles: any[] };
        }
      ).output.articles,
      timestamp: new Date().toISOString(),
      note:
        (
          context.steps.generateMeshTerms as {
            status: 'success';
            output: { note?: string };
          }
        ).output?.note || null,
    };
  },
});

export const researchWorkflow = new Workflow({
  name: 'pubmed-research-workflow',
  triggerSchema: z.object({
    query: z.string(),
  }),
});

researchWorkflow
  .step(generateMeshTerms)
  .then(fetchArticles)
  .then(fetchFullArticles)
  .then(structureResponse)
  .commit();
