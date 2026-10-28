import Link from "next/link";
import { appointments, leads, tasks } from "../customer-data";
import { CustomerPage, DemoNotice, StatusBadge } from "../customer-ui";
import styles from "../customer.module.css";

export default function TasksPage() {
  const openTasks = tasks.filter((task) => !task.done);
  const completedTasks = tasks.filter((task) => task.done);

  return (
    <CustomerPage
      current="tasks"
      title="Taken & afspraken"
      intro="Vervolgacties worden gekoppeld aan een verantwoordelijke; afspraken tonen alleen providerbevestigingen."
      actions={
        <Link className="button button-primary" href="/support">
          Vraag ondersteuning
        </Link>
      }
    >
      <DemoNotice>
        Aangevinkte taken en demo-acties worden niet opgeslagen. De echte taken- en agenda-integratie volgt via de backend.
      </DemoNotice>

      <section aria-labelledby="open-tasks-title">
        <div className="section-heading">
          <h2 id="open-tasks-title">Open taken ({openTasks.length})</h2>
          <p>Pak de belangrijkste persoonlijke opvolging eerst op.</p>
        </div>
        <ul className={styles.customerList}>
          {openTasks.map((task) => {
            const lead = task.leadId ? leads.find((candidate) => candidate.id === task.leadId) : undefined;

            return (
              <li className={styles.customerListItem} key={task.id}>
                <div className={styles.customerListMain}>
                  <input
                    className={styles.customerCheckbox}
                    type="checkbox"
                    aria-label={`Taak afvinken: ${task.text}`}
                  />
                  <div>
                    <strong>{task.text}</strong>
                    <p className={styles.customerListMeta}>{task.date} · {task.owner}</p>
                  </div>
                </div>
                {lead ? (
                  <Link className={styles.customerInlineLink} href={`/leads/${lead.id}`}>
                    Bekijk lead →
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="appointments-title">
        <div className="section-heading">
          <h2 id="appointments-title">Afspraken</h2>
          <p>Alleen afspraken die door de boekingsprovider zijn bevestigd.</p>
        </div>
        <div className={styles.customerStack}>
          {appointments.length > 0 ? appointments.map((appointment) => (
            <article className="card" key={appointment.id}>
              <div className={styles.customerCardContent}>
                <div className={styles.customerDetailHeader}>
                  <div>
                    <h2>{appointment.date} — {appointment.title}</h2>
                    <p>{appointment.provider}</p>
                  </div>
                  <StatusBadge tone="success">Bevestigd</StatusBadge>
                </div>
                <Link className={styles.customerTableLink} href={`/leads/${appointment.leadId}`}>
                  Bekijk aanvraag →
                </Link>
                <time className="visually-hidden" dateTime={appointment.dateTime}>{appointment.date}</time>
              </div>
            </article>
          )) : (
            <div className="card empty-state">
              <h3>Geen bevestigde afspraken</h3>
              <p>Nieuwe afspraken verschijnen hier zodra de boekingsprovider ze bevestigt.</p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="completed-tasks-title">
        <div className="section-heading">
          <h2 id="completed-tasks-title">Afgerond</h2>
          <p>Recente taken die als voltooid zijn gemarkeerd.</p>
        </div>
        <ul className={styles.customerList}>
          {completedTasks.map((task) => (
            <li className={`${styles.customerListItem} ${styles.customerListItemDone}`} key={task.id}>
              <div className={styles.customerListMain}>
                <input
                  className={styles.customerCheckbox}
                  type="checkbox"
                  defaultChecked
                  aria-label={`Afgeronde taak: ${task.text}`}
                />
                <div>
                  <strong>{task.text}</strong>
                  <p className={styles.customerListMeta}>{task.date} · {task.owner}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </CustomerPage>
  );
}
