/* Getting started (Overview, on a family server): the first steps for a new archive, ticked off from the server's own
   counts. Nothing here is sample data, and nothing is counted that isn't really there. Viewers can't add things, so they
   see what's been shared instead of tasks. Hiding it is remembered per account on this device. */
import { useCallback, useEffect, useState } from "react";
import { archiveApi } from "../lib/api";
import { cx } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { Button, Card, Icon, SectionTitle, Tag } from "./ui";

const EDITORS = ["Admin", "Custodian", "Contributor"];
const hiddenKey = (id) => `fr-gs-hidden-${id}`;
const readHidden = (id) => { try { return localStorage.getItem(hiddenKey(id)) === "1"; } catch { return false; } };
const writeHidden = (id, v) => { try { if (v) localStorage.setItem(hiddenKey(id), "1"); else localStorage.removeItem(hiddenKey(id)); } catch { /* storage blocked */ } };

/** What the checklist needs, from the server. Invitations are only listed for people who can send them. */
async function loadProgress(editor) {
  const [overview, records, invites] = await Promise.all([
    archiveApi.overview(), archiveApi.records(), editor ? archiveApi.invites() : Promise.resolve([]),
  ]);
  return { ...overview.counts, records: records.length, invites: invites.length };
}

/** One step: done or to do (in words and an icon, never colour alone), what it means, and where to do it. */
function Step({ done, title, detail, action }) {
  const t = useT();
  return (
    <li className={cx("flex flex-wrap items-start gap-3 rounded-2xl border p-4 sm:flex-nowrap", done ? "border-transparent bg-surface-2" : "border-line bg-surface")}>
      <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", done ? "bg-pine-700 text-white dark:bg-mint dark:text-pine-900" : "border-2 border-dashed border-line text-muted")}>
        <Icon name={done ? "check" : "radio_button_unchecked"} size="sm" />
      </span>
      <div className="min-w-0 flex-1">
        <strong className={cx("block", done && "text-muted")}>{title}</strong>
        <span className="sr-only">{done ? t("gs.done") : t("gs.todo")}. </span>
        <p className="mt-0.5 text-small text-muted">{detail}</p>
      </div>
      {action && <div className="shrink-0 max-sm:basis-full">{action}</div>}
    </li>
  );
}

export default function GettingStarted() {
  const t = useT();
  const { me } = useSession();
  const editor = EDITORS.includes(me.role);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(() => readHidden(me.id));

  // `attempt` goes up on Retry, which loads again. The steps are counted again whenever the archive gains or loses
  // something (and its changes have reached the server), so a first photo ticks its step straight away.
  const [attempt, setAttempt] = useState(0);
  const store = useStore();
  const st = store?.state;
  const changed = st ? [st.people.length, st.memories.length, st.stories.length, st.records.length, st.invites.length, store.server.saving === 0].join() : "";
  useEffect(() => {
    let live = true;
    loadProgress(editor).then((d) => { if (live) setData(d); }, (e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [editor, attempt, changed]);
  const load = useCallback(() => { setError(""); setData(null); setAttempt((a) => a + 1); }, []);

  const hide = (v) => { writeHidden(me.id, v); setHidden(v); };

  if (hidden) {
    return (
      <p className="mt-5.5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-small text-muted">
        <Icon name="checklist" size="sm" /> <span className="min-w-0 flex-1">{t("gs.hidden")}</span>
        <Button size="sm" onClick={() => hide(false)}>{t("gs.show")}</Button>
      </p>
    );
  }

  const n = (k) => data?.[k] ?? 0;
  // Content steps. On the server these counts only grow as screens move onto it (see the note under the list).
  const content = [
    ["people", n("people") > 1, "/tree", "nav.tree"],
    ["memory", n("memories") > 0, "/memories", "nav.memories"],
    ["story", n("stories") > 0, "/stories", "nav.stories"],
    ["record", n("records") > 0, "/legacy", "nav.legacy"],
  ];
  const countOf = { people: n("people"), memory: n("memories"), story: n("stories"), record: n("records") };
  const steps = data && [
    { key: "me", done: !!me.person_id, title: t("gs.me"), detail: me.person_id ? t("ob.me.linked") : t("gs.me.d"),
      action: !me.person_id && <Button size="sm" icon="badge" to="/welcome?step=profile">{t("gs.me.go")}</Button> },
    ...(editor ? [{
      key: "invite", done: n("invites") > 0, title: t("gs.invite"),
      detail: n("invites") > 0 ? t("gs.invite.dDone", { n: n("invites") }) : t("gs.invite.d"),
      action: <Button size="sm" icon="person_add" variant={n("invites") > 0 ? "default" : "primary"} to="/welcome?step=family">{t("gs.invite.go")}</Button>,
    }] : []),
    ...content.map(([k, done, to, screen]) => ({
      key: k, done, title: t(`gs.${k}`),
      detail: done ? t(`gs.${k}.dDone`, { n: countOf[k] }) : editor ? t(`gs.${k}.d`) : t("gs.viewer.empty"),
      action: <Button size="sm" variant="ghost" to={to}>{t("gs.open", { screen: t(screen) })} <Icon name="arrow_forward" size="xs" /></Button>,
    })),
  ];
  const doneCount = steps ? steps.filter((s) => s.done).length : 0;

  return (
    <Card className="mt-5.5" aria-labelledby="gsTitle">
      <SectionTitle>
        <div className="min-w-0">
          <h2 id="gsTitle" className="flex flex-wrap items-center gap-2.5"><Icon name="checklist" /> {t("gs.title", { family: me.family_name })}</h2>
          <p className="mt-1 text-small text-muted">{editor ? t("gs.sub") : t("gs.viewer")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {steps && <Tag tone="sec">{t("gs.progress", { done: doneCount, n: steps.length })}</Tag>}
          <Button size="sm" variant="ghost" icon="visibility_off" onClick={() => hide(true)}>{t("gs.hide")}</Button>
        </div>
      </SectionTitle>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2.5 rounded-xl bg-rose-100 p-3 text-small text-rose">
          <Icon name="error" size="sm" /> <span className="min-w-0 flex-1">{t("gs.error", { msg: error })}</span>
          <Button size="sm" icon="restart_alt" onClick={load}>{t("gs.retry")}</Button>
        </div>
      ) : !steps ? (
        <p role="status" className="rounded-xl bg-surface-2 p-4 text-small text-muted">{t("gs.loading")}</p>
      ) : (
        <>
          <div aria-hidden="true" className="mb-4 h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-pine-700 transition-[width] dark:bg-mint" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          {doneCount === steps.length && (
            <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-mint/30 p-3 text-small"><Icon name="celebration" size="sm" /> {t("gs.allDone")}</p>
          )}
          <ol className="m-0 grid list-none gap-2.5 p-0">
            {steps.map(({ key, ...s }) => <Step key={key} {...s} />)}
          </ol>
          <p className="mt-4 flex items-start gap-2 text-xsmall text-muted"><Icon name="info" size="xs" className="mt-0.5" /> {t("gs.sampleNote")}</p>
          <div className="mt-3"><Button size="sm" variant="ghost" icon="replay" to="/welcome">{t("gs.resume")}</Button></div>
        </>
      )}
    </Card>
  );
}
