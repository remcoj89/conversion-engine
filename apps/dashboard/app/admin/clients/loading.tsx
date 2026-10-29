import { LoadingState } from "../../ui-states";

export default function AdminClientsLoading() {
  return (
    <LoadingState
      title="Klanten worden geladen"
      message="We halen de actuele Platform Admin-klantenlijst op."
    />
  );
}
