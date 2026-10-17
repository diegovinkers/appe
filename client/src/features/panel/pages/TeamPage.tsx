import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, KeyRound, Pencil, Tablet, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { type ApiError, api } from "../../../api/client";
import type { TeamDevice, TeamMember, TeamResponse } from "../../../api/types";
import { teamDeviceKey, useTeamDevice } from "../../../auth/device";
import { formatWhen } from "../../../lib/format";
import { Spinner } from "../../../components/FullScreenMessage";
import { PageHeader } from "../../../components/PageHeader";
import { Sheet } from "../../../components/Sheet";
import { Field, Switch, button, input } from "../../../components/ui";
import { errorText, useT } from "../../../i18n";
import { usePanel } from "../PanelLayout";

const KEY = ["team"];
type Open = { mode: "add" } | { mode: "edit"; member: TeamMember } | { mode: "password"; member: TeamMember } | { mode: "pin"; member: TeamMember } | null;

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
                    {member.hasPin && <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-normal ring-1 ring-inset ring-line">{c.pinBadge}</span>}
                  </p>
                  <p className="break-all text-sm text-ink-muted">{member.email ?? c.pinOnly}</p>
                </div>
                {member.role === "staff" && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={button.secondary} onClick={() => setOpen({ mode: "edit", member })}>
                      <Pencil aria-hidden className="size-4" />
                      {c.edit}
                    </button>
                    <button type="button" className={button.secondary} onClick={() => setOpen({ mode: "pin", member })}>
                      <Hash aria-hidden className="size-4" />
                      {c.setPin}
                    </button>
                    {member.email && (
                      <button type="button" className={button.secondary} onClick={() => setOpen({ mode: "password", member })}>
                        <KeyRound aria-hidden className="size-4" />
                        {c.newPassword}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {staffCount === 0 && <p className="mt-4 rounded-xl border border-dashed border-line bg-surface p-4 text-ink-muted">{c.empty}</p>}
          <TeamDevices />
        </>
      )}

      <Sheet open={open?.mode === "add"} onClose={() => setOpen(null)} title={c.addTitle}>
        {open?.mode === "add" && <AddMember onDone={(name) => done(c.added(name))} />}
      </Sheet>
      <Sheet open={open?.mode === "edit"} onClose={() => setOpen(null)} title={open?.mode === "edit" ? c.editTitle(open.member.name) : ""}>
        {open?.mode === "edit" && <EditMember member={open.member} onDone={() => done(c.saved)} />}
      </Sheet>
      <Sheet open={open?.mode === "pin"} onClose={() => setOpen(null)} title={open?.mode === "pin" ? c.setPinTitle(open.member.name) : ""}>
        {open?.mode === "pin" && <MemberPin member={open.member} onDone={() => done(c.pinSaved)} />}
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
  const [withPin, setWithPin] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", pin: "" });
  const create = useTeamMutation<object>("/owner/team", "POST", () => onDone(form.name.trim()));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    create.mutate(withPin ? { name: form.name, pin: form.pin } : { name: form.name, email: form.email, password: form.password });
  };
  const chip = (on: boolean) => `${on ? "bg-action text-white" : "bg-surface ring-1 ring-line hover:bg-paper"} min-h-11 rounded-lg px-3 font-bold`;
  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <fieldset>
        <legend className="mb-2 font-bold">{c.howEnter}</legend>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={!withPin} onClick={() => setWithPin(false)} className={chip(!withPin)}>
            {c.withEmail}
          </button>
          <button type="button" aria-pressed={withPin} onClick={() => setWithPin(true)} className={chip(withPin)}>
            {c.withPin}
          </button>
        </div>
      </fieldset>
      <p className="text-sm text-ink-muted">{withPin ? c.withPinHint : c.addHint}</p>
      <Field id="member-name" label={c.name}>
        <input id="member-name" className={input} required maxLength={80} autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      {withPin ? (
        <Field id="member-pin" label={c.pin}>
          <input id="member-pin" className={`${input} max-w-40 tracking-[0.3em] tabular-nums`} required inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="off" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} />
        </Field>
      ) : (
        <>
          <Field id="member-email" label={c.email}>
            <input id="member-email" type="email" className={input} required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field id="member-password" label={c.password} hint={c.passwordHint}>
            <input id="member-password" type="text" className={input} required minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        </>
      )}
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

function MemberPin({ member, onDone }: { member: TeamMember; onDone: () => void }) {
  const t = useT();
  const c = t.team;
  const [pin, setPin] = useState("");
  const save = useTeamMutation<{ pin: string }>(`/owner/team/${member._id}/pin`, "PUT", onDone);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!save.isPending && pin.length >= 4) save.mutate({ pin });
  };
  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <p className="text-sm text-ink-muted">{c.setPinHint}</p>
      <Field id="set-pin" label={c.pin}>
        <input id="set-pin" className={`${input} max-w-40 tracking-[0.3em] tabular-nums`} required inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </Field>
      {save.isError && (
        <p role="alert" className="font-bold text-error">
          {errorText(save.error, t)}
        </p>
      )}
      <button className={`${button.primary} w-full`} disabled={save.isPending || pin.length < 4}>
        {save.isPending ? c.saving : c.save}
      </button>
    </form>
  );
}

// Los aparatos del equipo: desde ahí se entra con nombre y PIN. Se registra desde el mismo
// aparato (queda una cookie en ese navegador).
function TeamDevices() {
  const t = useT();
  const c = t.team;
  const cache = useQueryClient();
  const devicesKey = ["team-devices"];
  const query = useQuery({ queryKey: devicesKey, queryFn: () => api<{ devices: TeamDevice[] }>("/owner/devices") });
  const current = useTeamDevice();
  const [name, setName] = useState("");
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: devicesKey });
    void cache.invalidateQueries({ queryKey: teamDeviceKey });
  };
  const register = useMutation<unknown, ApiError, string>({
    mutationFn: (deviceName) => api("/owner/devices", { method: "POST", body: { name: deviceName } }),
    onSuccess: () => {
      setName("");
      refresh();
    },
  });
  const revoke = useMutation<unknown, ApiError, string>({ mutationFn: (id) => api(`/owner/devices/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const devices = query.data?.devices ?? [];
  const thisOne = current.data?.device._id;

  return (
    <section aria-labelledby="aparelhos" className="mt-8 space-y-3">
      <h2 id="aparelhos" className="text-lg font-bold">
        {c.devices}
      </h2>
      <p className="text-sm text-ink-muted">{c.devicesHint}</p>
      {devices.length === 0 && query.isSuccess && <p className="text-ink-muted">{c.noDevices}</p>}
      {devices.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {devices.map((device) => (
            <li key={device._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Tablet aria-hidden className="size-5 text-ink-muted" />
              <div className="min-w-40 flex-1">
                <p className="font-bold">
                  {device.name}
                  {device._id === thisOne && <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-normal ring-1 ring-inset ring-line">{c.thisDevice}</span>}
                </p>
                <p className="text-sm text-ink-muted">{device.lastUsedAt ? c.lastUsed(formatWhen(device.lastUsedAt)) : c.neverUsed}</p>
              </div>
              <button
                type="button"
                className={button.danger}
                disabled={revoke.isPending}
                onClick={() => {
                  if (window.confirm(c.revokeConfirm(device.name))) revoke.mutate(device._id);
                }}
              >
                {c.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!thisOne && (
        <form
          className="flex max-w-xl flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !register.isPending) register.mutate(name.trim());
          }}
        >
          <Field id="device-name" label={c.deviceName}>
            <input id="device-name" className={input} required maxLength={40} placeholder={c.deviceNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className={button.primary} disabled={!name.trim() || register.isPending}>
            <Tablet aria-hidden className="size-4" />
            {c.registerDevice}
          </button>
        </form>
      )}
      {(register.isError || revoke.isError) && (
        <p role="alert" className="font-bold text-error">
          {errorText(register.error ?? revoke.error, t)}
        </p>
      )}
    </section>
  );
}
