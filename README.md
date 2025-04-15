# PubMed Research Agent

The PubMed Research Agent assists users with researching scientific topics by aggregating relevant PubMed articles and using an LLM. The app retrieves relevant scientific articles, processes them, and generates informed responses with citations from PubMed articles. It uses Retrieval-Augmented Generation (RAG) to ensure responses are grounded in credible sources.

RabbitMQ is used as a message broker to decouple and parallelize tasks. 

The current workflow is as follows:
- User submits a query
- LLM parses out key terms to search Pub Med api
- Make api call to Pub Med and get relevant articles metadata
- Download raw text of each article, chunk and embed it in vector DB
- Embed user query and generate response with RAG

## Future Improvements
- Improve RAG by having LLM extract key details from user query

<img width="1136" alt="image" src="https://github.com/user-attachments/assets/d18c6b70-ba8b-4edb-8bc6-3225438daf23" />
