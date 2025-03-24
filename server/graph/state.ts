import { Annotation } from "@langchain/langgraph";

export interface Section {
  /**
   * Name for this section of the report.
   */
  name: string;
  /**
   * Brief overview of the main topics and concepts to be covered in this section.
   */
  description: string;
  /**
   * Whether to perform web research for this section of the report.
   */
  research: boolean;
  /**
   * The content of the section.
   */
  content: string;
}

export const SectionAnnotation = Annotation.Root({
  section: Annotation<Section>(),
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
  sections: Annotation<Section[]>(),

  completedSections: Annotation<string[]>(),

  reportSectionsFromResearch: Annotation<string>(),

  finalReport: Annotation<string>(),
})