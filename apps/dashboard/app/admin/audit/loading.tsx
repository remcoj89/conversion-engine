import { LoadingState } from "../../ui-states";

export default function AdminAuditLoading() {
  return <LoadingState title="Audit-dashboard wordt geladen" message="We halen de veilige auditmetadata op." />;
}
