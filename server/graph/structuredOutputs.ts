import { z } from 'zod'

export const SectionOutput = z.object({
  name: z.string().describe('Name for this section of the report.'),
  description: z.string().describe('Brief overview of the main topics and concepts to be covered in this section.'),
  research: z.boolean().describe('Whether to perform web research for this section of the report.'),
  content: z.string().describe('The content of the section.'),
})

export const SectionsOutput = z.object({
  sections: z.array(SectionOutput).describe('Sections of the report.'),
})

export const SearchQueryOutput = z.object({
  searchQuery: z.string().describe('Query for web search.'),
})

export const QueriesOutput = z.object({
  queries: z.array(SearchQueryOutput).describe('List of search queries.'),
})
