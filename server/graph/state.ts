import type { z } from 'zod'
import type { SectionOutput } from './structuredOutputs'
import { Annotation } from '@langchain/langgraph'

export type Section = z.infer<typeof SectionOutput>

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
