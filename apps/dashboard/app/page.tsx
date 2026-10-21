import TodayOverview from "./today-overview";

export default function TodayPage() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Conversion Engine</p>
        <h1>Vandaag</h1>
        <p className="intro">
          Bekijk hier de belangrijkste acties en opvolging.
        </p>
      </div>

      <TodayOverview />
    </>
  );
}
