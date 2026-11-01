import { LoadingState } from "../../ui-states";

export default function Loading() {
  return <LoadingState title="Pipeline wordt geladen" message="We controleren welke pipelinegegevens voor deze klantomgeving beschikbaar zijn." />;
}
