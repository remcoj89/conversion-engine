import { AdminClientsOverview } from "./clients/page";

type AdminOverviewPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function AdminOverviewPage(props: AdminOverviewPageProps) {
  return <AdminClientsOverview {...props} basePath="/admin" />;
}
