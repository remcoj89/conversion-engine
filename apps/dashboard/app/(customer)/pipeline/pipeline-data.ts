export type PipelineStage = Readonly<{
  id: string;
  label: string;
  position: number;
}>;

export type PipelineDeal = Readonly<{
  id: string;
  title: string;
  stageId: string;
  contactName: string;
  valueEur: number | null;
  nextActionAt: string | null;
}>;

export type PipelineResponse = Readonly<{
  pipeline: Readonly<{ id: string; name: string }>;
  stages: readonly PipelineStage[];
  deals: readonly PipelineDeal[];
}>;

export function parsePipelineResponse(value: unknown): PipelineResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ["pipeline", "stages", "deals"])) return null;
  const pipeline = parsePipeline(value.pipeline);
  const stages = parseStages(value.stages);
  const deals = parseDeals(value.deals);
  if (!pipeline || !stages || !deals) return null;
  if (deals.some((deal) => !stages.some((stage) => stage.id === deal.stageId))) return null;
  return { pipeline, stages, deals };
}

function parsePipeline(value: unknown): PipelineResponse["pipeline"] | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "name"])) return null;
  if (!isBoundedString(value.id, 100) || !isBoundedString(value.name, 120)) return null;
  return { id: value.id.trim(), name: value.name.trim() };
}

function parseStages(value: unknown): readonly PipelineStage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const stages = value.map((stage) => {
    if (!isRecord(stage) || !hasExactKeys(stage, ["id", "label", "position"])) return null;
    if (!isBoundedString(stage.id, 100) || !isBoundedString(stage.label, 120) || typeof stage.position !== "number" || !Number.isInteger(stage.position) || stage.position < 0) return null;
    return { id: stage.id.trim(), label: stage.label.trim(), position: stage.position };
  });
  if (stages.some((stage): stage is null => stage === null)) return null;
  const parsed = stages as PipelineStage[];
  if (new Set(parsed.map((stage) => stage.id)).size !== parsed.length) return null;
  return [...parsed].sort((left, right) => left.position - right.position);
}

function parseDeals(value: unknown): readonly PipelineDeal[] | null {
  if (!Array.isArray(value)) return null;
  const deals = value.map((deal) => {
    if (!isRecord(deal) || !hasExactKeys(deal, ["id", "title", "stageId", "contactName", "valueEur", "nextActionAt"])) return null;
    if (!isBoundedString(deal.id, 100) || !isBoundedString(deal.title, 200) || !isBoundedString(deal.stageId, 100) || !isBoundedString(deal.contactName, 200)) return null;
    if (deal.valueEur !== null && (typeof deal.valueEur !== "number" || !Number.isFinite(deal.valueEur) || deal.valueEur < 0)) return null;
    if (deal.nextActionAt !== null && (typeof deal.nextActionAt !== "string" || Number.isNaN(Date.parse(deal.nextActionAt)))) return null;
    return {
      id: deal.id.trim(),
      title: deal.title.trim(),
      stageId: deal.stageId.trim(),
      contactName: deal.contactName.trim(),
      valueEur: deal.valueEur,
      nextActionAt: deal.nextActionAt,
    };
  });
  if (deals.some((deal): deal is null => deal === null)) return null;
  const parsed = deals as PipelineDeal[];
  return new Set(parsed.map((deal) => deal.id)).size === parsed.length ? parsed : null;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}
