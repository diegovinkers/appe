import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { type ApiError, api } from "../../../api/client";
import type { TeamMember, TeamResponse } from "../../../api/types";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Sheet } from "../../../components/Sheet";
import { Field, Switch, button, input } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { usePanel } from "../PanelLayout";

const KEY = ["team"];
type Open = { mode: "add" } | { mode: "edit"; member: TeamMember } | { mode: "password"; member: TeamMember } | null;

// Equipe: el dueño da de alta a quien atiende, lo desactiva o le pone una contraseña nueva.
export function TeamPage() {
  const t = useT();
  const c = t.team;
  const { user } = usePanel();
  const query = useQuery({ queryKey: KEY, queryFn: () => api<TeamResponse>("/owner/team") });
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState("");
  const done = (message: string) => {
    setOpen(null);
    setNotice(message);
  };
  const members = query.data?.members ?? [];
  const staffCount = members.filter((member) => member.role === "staff").length;

  return (
    <>
      <PageHeader
        title={t.pages.team.title}
        description={t.pages.team.description}
        actions={
          <button type="button" className={button.primary} onClick={() => setOpen({ mode: "add" })}>
            <UserPlus aria-hidden className="size-5" />
            {c.add}
          </button>
        }
      />
      {notice && (
        <p role="status" className="mb-4 text-success">
          {notice}
        </p>
      )}
      {query.isPending && <Spinner />}
      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-error">
          {errorText(query.error, t)}
          <button type="button" className={button.secondary} onClick={() => void query.refetch()}>
            {t.errors.retry}
          </button>
        </div>
      )}
      {query.data && (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {members.map((member) => (
              <li key={member._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {/* En el celular los botones bajan a su propia línea y el nombre queda entero. */}
                <div className="min-w-56 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    <span className={member.active ? "" : "text-ink-muted line-through"}>{member.name}</span>
                    <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-normal ring-1 ring-inset ring-line">
                      {member._id === user._id ? c.you : t.user.roles[member.role]}
                    </span>
                    {!member.active && <span className="rounded-full bg-error-soft px-2 py-0.5 text-xs text-error">{c.inactive}</span>}
                  </p>
                  <p className="break-all text-sm text-ink-muted">{member.email}</p>
                </div>
                {member.role === "staff" && (
                  <div className="flex gap-2">
                    <button type="button" className={button.secondary} onClick={() => setOpen({ mode: "edit", member })}>
                      <Pencil aria-hidden className="size-4" />
                      {c.edit}
                    </button>
                    <button type="button" className={button.secondary} onClick={() => setOpen({ mode: "password", member })}>
                      <KeyRound aria-hidden className="size-4" />
                      {c.newPassword}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {staffCount === 0 && <p className="mt-4 rounded-xl border border-dashed border-line bg-surface p-4 text-ink-muted">{c.empty}</p>}
        </>
      )}

      <Sheet open={open?.mode === "add"} onClose={() => setOpen(null)} title={c.addTitle}>
        {open?.mode === "add" && <AddMember onDone={(name) => done(c.added(name))} />}
      </Sheet>
      <Sheet open={open?.mode === "edit"} onClose={() => setOpen(null)} title={open?.mode === "edit" ? c.editTitle(open.member.name) : ""}>
        {open?.mode === "edit" && <EditMember member={open.member} onDone={() => done(c.saved)} />}
      </Sheet>
      <Sheet open={open?.mode === "password"} onClose={() => setOpen(null)} title={open?.mode === "password" ? c.newPasswordTitle(open.member.name) : ""}>
        {open?.mode === "password" && <MemberPassword member={open.member} onDone={() => done(c.passwordSaved)} />}
      </Sheet>
    </>
  );
}

function useTeamMutation<Body>(path: string, method: "POST" | "PATCH" | "PUT", onDone: () => void) {
  const cache = useQueryClient();
  return useMutation<unknown, ApiError, Body>({
    mutationFn: (body) => api(path, { method, body }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: KEY });
      onDone();
    },
  });
}

function AddMember({ onDone }: { onDone: (name: string) => void }) {
  const t = useT();
  const c = t.team;
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const create = useTeamMutation<typeof form>("/owner/team", "POST", () => onDone(form.name.trim()));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!create.isPending) create.mutate(form);
  };
  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <p className="text-sm text-ink-muted">{c.addHint}</p>
      <Field id="member-name" label={c.name}>
        <input id="member-name" className={input} required maxLength={80} autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field id="member-email" label={c.email}>
        <input id="member-email" type="email" className={input} required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field id="member-password" label={c.password} hint={c.passwordHint}>
        <input id="member-password" type="text" className={input} required minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      {create.isError && (
        <p role="alert" className="font-bold text-error">
          {errorText(create.error, t)}
        </p>
      )}
      <button className={`${button.primary} w-full`} disabled={create.isPending}>
        {create.isPending ? c.saving : c.create}
      </button>
    </form>
  );
}

function EditMember({ member, onDone }: { member: TeamMember; onDone: () => void }) {
  const t = useT();
  const c = t.team;
  const [form, setForm] = useState({ name: member.name, active: member.active });
  const update = useTeamMutation<typeof form>(`/owner/team/${member._id}`, "PATCH", onDone);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!update.isPending) update.mutate({ ...form, name: form.name.trim() });
  };
  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <Field id="edit-name" label={c.name}>
        <input id="edit-name" className={input} required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Switch label={c.active} checked={form.active} onChange={(active) => setForm({ ...form, active })} />
      {update.isError && (
        <p role="alert" className="font-bold text-error">
          {errorText(update.error, t)}
        </p>
      )}
      <button className={`${button.primary} w-full`} disabled={update.isPending}>
        {update.isPending ? c.saving : c.save}
      </button>
    </form>
  );
}

function MemberPassword({ member, onDone }: { member: TeamMember; onDone: () => void }) {
  const t = useT();
  const c = t.team;
  const [password, setPassword] = useState("");
  const reset = useTeamMutation<{ password: string }>(`/owner/team/${member._id}/password`, "PUT", onDone);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reset.isPending) reset.mutate({ password });
  };
  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <p className="text-sm text-ink-muted">{c.newPasswordHint}</p>
      <Field id="reset-password" label={c.newPassword} hint={t.myAccount.newPasswordHint}>
        <input id="reset-password" type="text" className={input} required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {reset.isError && (
        <p role="alert" className="font-bold text-error">
          {errorText(reset.error, t)}
        </p>
      )}
      <button className={`${button.primary} w-full`} disabled={reset.isPending}>
        {reset.isPending ? c.saving : c.save}
      </button>
    </form>
  );
}
