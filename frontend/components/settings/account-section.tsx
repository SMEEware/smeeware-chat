"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ImageIcon,
  Loader2Icon,
  LogOutIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  useAccount,
  useDeleteAccount,
  useClearAvatar,
  useSetAvatar,
  useUpdateAccount,
} from "@/hooks/use-account";
import { cn } from "@/lib/utils";
import { SectionCard, SectionHeader } from "@/components/settings/section-parts";
import { useT } from "@/context/i18n-provider";

export function AccountSection() {
  const t = useT();
  const router = useRouter();
  const account = useAccount();
  const avatar = useSetAvatar();
  const removeAvatar = useClearAvatar();
  const change = useUpdateAccount();

  const imageRef = React.useRef<HTMLInputElement>(null);
  const [nameDraft, setName] = React.useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [passwordRepeat, setPasswordRepeat] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [signOut, setLoggingOut] = React.useState(false);

  const user = account.data?.username ?? "";
  const initials = user.trim().charAt(0).toUpperCase() || "?";
  const name = nameDraft ?? user;

  const report = (text: string) => {
    setSuccess(text);
    setError(null);
    setTimeout(() => setSuccess(null), 4000);
  };

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await change.mutateAsync({ username: name.trim() });
      setName(null);
      report(t("settings.account.nameChanged"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.failed"));
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (newPassword !== passwordRepeat) {
      setError(t("settings.account.passwordsNoMatch"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("settings.account.minChars"));
      return;
    }

    try {
      await change.mutateAsync({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordRepeat("");
      report(t("settings.account.passwordChanged"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.failed"));
    }
  };

  const logOut = async () => {
    setLoggingOut(true);
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
  };

  const remove = useDeleteAccount();
  const [confirm, setConfirm] = React.useState(false);

  const deleteAccount = async () => {
    setError(null);
    try {
      await remove.mutateAsync();
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.failed"));
      setConfirm(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={t("settings.account.title")}
        text={t("settings.account.text")}
      />

      <SectionCard className="flex items-center gap-4">
        <div className="group/bild relative size-16 shrink-0">
          <button
            type="button"
            onClick={() => imageRef.current?.click()}
            disabled={avatar.isPending || removeAvatar.isPending}
            className="group relative size-16 cursor-pointer overflow-hidden rounded-full ring-1 ring-border/70 transition-colors ring-inset hover:ring-primary/45 disabled:opacity-50"
            aria-label={t("settings.account.changePicture")}
          >
            {account.data?.has_avatar ? (
              <Image
                key={account.dataUpdatedAt}
                src={`/api/account/avatar?v=${account.dataUpdatedAt}`}
                alt=""
                height={64}
                width={64}
                unoptimized
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center bg-primary/10 text-xl font-semibold text-primary">
                {initials}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
              {avatar.isPending || removeAvatar.isPending ? (
                <Loader2Icon className="size-4 animate-spin text-primary" />
              ) : (
                <ImageIcon className="size-4 text-foreground" />
              )}
            </span>
          </button>

          {account.data?.has_avatar ? (
            <button
              type="button"
              onClick={() => {
                removeAvatar.mutate(undefined, {
                  onSuccess: () =>
                    toast.success(t("settings.account.pictureRemoved")),
                  onError: (error: Error) => toast.error(error.message),
                });
              }}
              disabled={removeAvatar.isPending}
              aria-label={t("settings.account.removePicture")}
              title={t("settings.account.removePicture")}
              className="absolute -top-0.5 -end-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 ring-1 ring-border transition-[opacity,color] hover:text-destructive hover:ring-destructive/40 focus-visible:opacity-100 group-hover/bild:opacity-100 disabled:opacity-50 max-md:opacity-100"
            >
              <XIcon className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{user}</span>
          <span className="text-[12px] text-muted-foreground/60">
            {account.data?.has_avatar
              ? t("settings.account.hasAvatar")
              : t("settings.account.noAvatar")}
          </span>
        </div>

        <button
          type="button"
          onClick={logOut}
          disabled={signOut}
          className="ms-auto flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] text-muted-foreground/70 ring-1 ring-border/70 transition-colors ring-inset hover:text-destructive hover:ring-destructive/40 disabled:opacity-50"
        >
          <LogOutIcon className="size-3.5" />
          {t("settings.account.signOut")}
        </button>

        <input
          ref={imageRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) avatar.mutate(file);
          }}
        />
      </SectionCard>

      <SectionCard>
        <form onSubmit={saveName} className="flex flex-col gap-3">
          <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
            {t("settings.account.username")}
          </h3>
          <div className="flex gap-2">
            <InputField
              value={name}
              onChange={setName}
              placeholder={t("settings.account.usernamePlaceholder")}
              className="flex-1"
            />
            <SubmitButton
              disabled={!name.trim() || name.trim() === user}
              running={change.isPending}
            />
          </div>
        </form>
      </SectionCard>

      <SectionCard>
        <form onSubmit={savePassword} className="flex flex-col gap-3">
          <h3 className="text-[10px] font-medium tracking-[0.09em] text-muted-foreground/45 uppercase">
            {t("settings.account.password")}
          </h3>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <InputField
              value={currentPassword}
              onChange={setCurrentPassword}
              type="password"
              autoComplete="current-password"
              placeholder={t("settings.account.currentPassword")}
              className="col-span-2"
            />
            <span aria-hidden />

            <InputField
              value={newPassword}
              onChange={setNewPassword}
              type="password"
              autoComplete="new-password"
              placeholder={t("settings.account.newPassword")}
            />
            <InputField
              value={passwordRepeat}
              onChange={setPasswordRepeat}
              type="password"
              autoComplete="new-password"
              placeholder={t("settings.account.repeat")}
            />
            <SubmitButton
              disabled={!currentPassword || !newPassword || !passwordRepeat}
              running={change.isPending}
            />
          </div>
        </form>
      </SectionCard>

      {error || success ? (
        <p
          className={cn(
            "-mt-2 text-[12px]",
            error ? "text-destructive" : "text-emerald-500",
          )}
        >
          {error ?? success}
        </p>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-5">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-destructive/25 opacity-40 blur-3xl"
        />
        <div className="relative flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Trash2Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-sm font-medium text-foreground">
              {t("settings.account.deleteTitle")}
            </h3>
            <p className="text-[12px] leading-relaxed text-muted-foreground/60">
              {t("settings.account.deleteText")}
            </p>
          </div>
        </div>

        <div className="relative mt-4">
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-destructive">
                {t("settings.account.deleteConfirm")}
              </span>
              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirm(false)}
                  disabled={remove.isPending}
                  className="h-8 cursor-pointer rounded-lg px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  {t("settings.account.cancel")}
                </button>
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={remove.isPending}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-destructive px-3 text-[12px] font-medium text-white shadow-sm shadow-destructive/30 transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {remove.isPending ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-3.5" />
                  )}
                  {t("settings.account.deleteEverything")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-destructive ring-1 ring-destructive/30 transition-colors ring-inset hover:bg-destructive/10 hover:ring-destructive/45"
            >
              <Trash2Icon className="size-3.5" />
              {t("settings.account.deleteTitle")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InputField({
  value,
  onChange,
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<"input">, "onChange" | "value">) {
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-9 min-w-0 shrink-0 rounded-lg bg-muted/40 px-3 text-[13px] outline-none transition-shadow placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-inset",
        className,
      )}
    />
  );
}

function SubmitButton({ disabled, running }: { disabled: boolean; running: boolean }) {
  const t = useT();
  return (
    <button
      type="submit"
      disabled={disabled || running}
      className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium text-foreground/80 ring-1 ring-border/70 transition-colors ring-inset hover:text-primary hover:ring-primary/45 disabled:pointer-events-none disabled:opacity-40"
    >
      {running ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
      {t("settings.account.save")}
    </button>
  );
}
