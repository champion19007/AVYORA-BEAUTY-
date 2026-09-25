import { enqueue, PermanentJobError } from '@/infrastructure/jobs/queue';

/**
 * Photo-based skin analysis: the seam, not the model.
 *
 * No analyser exists yet, and none is pretended. What is fixed here is where
 * one plugs in and how it runs:
 *
 *   - Never on the request path. A vision model takes seconds and fails in
 *     ways a checkout must not; the customer's request enqueues a job and
 *     returns, and the result is read back later.
 *   - The image is referenced by an object-storage key, never passed inline,
 *     so a job row never holds a face.
 *   - Consent is required at enqueue time and travels with the job.
 *   - Output is advisory. It may suggest concerns to browse; it must never
 *     change a price, stock or an order, and it is not medical advice.
 *
 * Until an implementation is configured, jobs of this type fail permanently
 * with a message saying so, rather than retrying against nothing.
 */

export const SKIN_ANALYSIS_JOB = 'ai.skin_analysis';

export type SkinAnalysisResult = {
  /** Concern ids from the catalogue's own list, e.g. `hydration`, `acne`. */
  concerns: { id: string; confidence: number }[];
  modelVersion: string;
};

export interface SkinImageAnalyzer {
  readonly modelVersion: string;
  analyze(imageKey: string): Promise<SkinAnalysisResult>;
}

/** No provider is configured today; see the module comment. */
export function configuredSkinAnalyzer(): SkinImageAnalyzer | null {
  return null;
}

export async function requestSkinAnalysis(input: {
  imageKey: string;
  userId: string;
  consentedAt: Date;
}): Promise<number | null> {
  return enqueue(
    SKIN_ANALYSIS_JOB,
    { imageKey: input.imageKey, userId: input.userId, consentedAt: input.consentedAt.toISOString() },
    { dedupeKey: `skin:${input.imageKey}`, maxAttempts: 3 }
  );
}

export function skinAnalysisJobHandler(analyzer: () => SkinImageAnalyzer | null = configuredSkinAnalyzer) {
  return async (payload: Record<string, unknown>) => {
    const model = analyzer();
    if (!model) throw new PermanentJobError('No skin analyser is configured.');
    if (!payload.consentedAt) throw new PermanentJobError('No consent recorded for this image.');
    // Storing the result belongs with the feature that shows it, which does
    // not exist yet. Running the model is as far as this seam goes.
    await model.analyze(String(payload.imageKey));
  };
}
