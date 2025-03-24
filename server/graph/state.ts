import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

const Section = z.object({
  name: z.string().describe('Name for this section of the report.'),
  description: z.string().describe('Brief overview of the main topics and concepts to be covered in this section.'),
  research: z.boolean().describe('Whether to perform web research for this section of the report.'),
  content: z.string().describe('The content of the section.'),
})

export const Sections = z.object({
  sections: z.array(Section).describe('Sections of the report.'),
})

const SearchQuery = z.object({
  searchQuery: z.string().describe('Query for web search.'),
})

export const Queries = z.object({
  queries: z.array(SearchQuery).describe('List of search queries.'),
})


export const ReportState = Annotation.Root({
  /**
   * Report topic    
   */
  topic: Annotation<string>(),
  /**
   * Feedback on the report plan
   */
  feedbackOnReportPlan: Annotation<string>(),
  /**
   * List of report sections 
   */
  sections: Annotation<typeof Sections>(),

  completedSections: Annotation<string[]>(),

  reportSectionsFromResearch: Annotation<string>(),

  finalReport: Annotation<string>(),
})