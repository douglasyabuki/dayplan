"use client";

import { Camera } from "lucide-react";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAccount } from "@/stores/account/provider";

import { AccountAvatar } from "./account-avatar";
import { AuthControls } from "./auth-controls";
import { GuestImportPanel } from "./guest-import-panel";

export type AccountEditHandle = { commit: () => void; cancel: () => void };

export function AccountPanel({ ref }: { ref?: Ref<AccountEditHandle> }) {
  const {
    profile,
    ready,
    storageError,
    updateName,
    updateStatus,
    updateError,
    capabilities,
  } = useAccount();
  const [draft, setDraft] = useState(profile.name);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const value = useRef(profile.name);
  const lastSaved = useRef(profile.name);
  const cancelled = useRef(false);
  const active = useRef(false);
  const request = useRef(0);
  const committing = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current += 1;
    };
  }, []);

  async function commit() {
    if (
      cancelled.current ||
      !ready ||
      committing.current ||
      updateStatus === "pending"
    )
      return;
    const name = value.current.trim();
    if (!name) {
      setError(true);
      return;
    }
    if (name !== lastSaved.current) {
      const id = ++request.current;
      committing.current = true;
      const success = await updateName(name);
      committing.current = false;
      if (!active.current || id !== request.current || cancelled.current)
        return;
      if (!success) return;
      lastSaved.current = name;
      setSaved(true);
    }
    value.current = name;
    setDraft(name);
    setError(false);
  }

  function cancel() {
    // Set the guard synchronously: closing the dialog may cause an input blur.
    cancelled.current = true;
    request.current += 1;
    value.current = lastSaved.current;
    setDraft(lastSaved.current);
    setError(false);
    setSaved(false);
  }

  useImperativeHandle(ref, () => ({ commit, cancel }));

  return (
    <div className="flex flex-col gap-6">
      <AuthControls authenticated={capabilities.hasAccount} />
      {capabilities.hasAccount && <GuestImportPanel always />}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          className="group relative size-16 shrink-0 rounded-full p-0"
          aria-disabled="true"
          aria-label="Change profile photo — coming soon"
          aria-describedby="photo-help"
        >
          <AccountAvatar className="size-16" />
          <span
            className="bg-background/80 absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden="true"
          >
            <Camera />
          </span>
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{profile.name}</p>
          <p
            id="photo-help"
            className="text-muted-foreground text-sm leading-normal"
          >
            Photo uploads coming soon
          </p>
        </div>
      </div>
      <FieldGroup>
        <Field
          data-invalid={error || !!updateError}
          data-disabled={!ready || updateStatus === "pending"}
        >
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <Input
            id="account-name"
            maxLength={capabilities.hasAccount ? 120 : undefined}
            value={draft}
            disabled={!ready || updateStatus === "pending"}
            aria-invalid={error || !!updateError}
            aria-describedby={
              error || updateError ? "account-name-error" : "account-name-help"
            }
            onChange={(event) => {
              cancelled.current = false;
              value.current = event.target.value;
              setDraft(value.current);
              setError(false);
              setSaved(false);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229)
                return;
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
          />
          {error || updateError ? (
            <FieldError id="account-name-error">
              {updateError || "Enter a name."}
            </FieldError>
          ) : (
            <FieldDescription id="account-name-help">
              Saved automatically when you leave this field.
            </FieldDescription>
          )}
          <p role="status" className="text-muted-foreground min-h-4 text-xs">
            {updateStatus === "pending"
              ? "Saving name…"
              : saved
                ? storageError
                  ? "Updated for this session."
                  : "Name saved."
                : ""}
          </p>
        </Field>
        <Field>
          <FieldLabel>Email</FieldLabel>
          <p className="text-sm break-all">
            {capabilities.hasAccount
              ? profile.email
              : "No account-associated email"}
          </p>
          <FieldDescription>
            {capabilities.hasAccount
              ? "Your account profile."
              : "Your guest profile and workspace are saved in this browser. Sign in with Google to use an account."}
          </FieldDescription>
        </Field>
      </FieldGroup>
      {storageError && (
        <Alert>
          <AlertDescription>
            {capabilities.hasAccount
              ? "Your account profile could not be loaded or saved. Please retry."
              : "Your browser could not save guest profile changes. Changes remain available in this session."}
          </AlertDescription>
        </Alert>
      )}
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Password</p>
          <p className="text-muted-foreground text-sm">
            {capabilities.hasAccount
              ? "You sign in with Google; a Dayplan password is not required."
              : "Sign in with Google to use an account."}
          </p>
        </div>
        <Button variant="outline" disabled>
          Change password
        </Button>
      </div>
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-destructive text-sm font-medium">Delete account</p>
          <p className="text-muted-foreground text-sm">
            {capabilities.hasAccount
              ? "Not available yet"
              : "Guests have no account to delete."}
          </p>
        </div>
        <Button variant="destructive" disabled>
          Delete account
        </Button>
      </div>
    </div>
  );
}
