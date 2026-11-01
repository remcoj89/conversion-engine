import assert from "node:assert/strict";
import test from "node:test";
import { parsePipelineResponse } from "./pipeline-data";

const pipeline = {
  pipeline: { id: "default", name: "Sales" },
  stages: [{ id: "new", label: "Nieuw", position: 0 }],
  deals: [{ id: "deal-1", title: "Kennismaking", stageId: "new", contactName: "Sam Jansen", valueEur: 900, nextActionAt: null }],
} as const;

test("pipeline parser accepts tenant-bound stages and deals", () => {
  assert.deepEqual(parsePipelineResponse(pipeline), pipeline);
});

test("pipeline parser rejects duplicate records and unknown stages", () => {
  assert.equal(parsePipelineResponse({ ...pipeline, deals: [{ ...pipeline.deals[0], stageId: "missing" }] }), null);
  assert.equal(parsePipelineResponse({ ...pipeline, stages: [...pipeline.stages, { ...pipeline.stages[0] }] }), null);
  assert.equal(parsePipelineResponse({ ...pipeline, deals: [{ ...pipeline.deals[0] }, { ...pipeline.deals[0] }] }), null);
});
