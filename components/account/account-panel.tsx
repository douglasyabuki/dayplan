"use client";

import { Camera } from "lucide-react";
import { type Ref, useImperativeHandle, useRef, useState } from "react";

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

export type AccountEditHandle = { commit: () => void; cancel: () => void };

export function AccountPanel({ ref }: { ref?: Ref<AccountEditHandle> }) {
  const { profile, ready, storageError, updateName } = useAccount();
  const [draft, setDraft] = useState(profile.name);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const value = useRef(profile.name);
  const lastSaved = useRef(profile.name);
  const cancelled = useRef(false);

  function commit() {
    if (cancelled.current || !ready) return;
    const name = value.current.trim();
    if (!name) {
      setError(true);
      return;
    }
    if (name !== lastSaved.current && updateName(name)) {
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
    value.current = lastSaved.current;
    setDraft(lastSaved.current);
    setError(false);
    setSaved(false);
  }

  useImperativeHandle(ref, () => ({ commit, cancel }));

  return (
    <div className="flex flex-col gap-6">
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
        <Field data-invalid={error} data-disabled={!ready}>
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <Input
            id="account-name"
            value={draft}
            disabled={!ready}
            aria-invalid={error}
            aria-describedby={
              error ? "account-name-error" : "account-name-help"
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
          {error ? (
            <FieldError id="account-name-error">Enter a name.</FieldError>
          ) : (
            <FieldDescription id="account-name-help">
              Saved automatically when you leave this field.
            </FieldDescription>
          )}
          <p role="status" className="text-muted-foreground min-h-4 text-xs">
            {saved
              ? storageError
                ? "Updated for this session."
                : "Name saved."
              : ""}
          </p>
        </Field>
        <Field>
          <FieldLabel>Email</FieldLabel>
          <p className="text-sm break-all">{profile.email}</p>
          <FieldDescription>
            This is a mock account stored in this browser.
          </FieldDescription>
        </Field>
      </FieldGroup>
      {storageError && (
        <Alert>
          <AlertDescription>
            Your browser could not save account changes. Changes remain
            available in this session.
          </AlertDescription>
        </Alert>
      )}
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Password</p>
          <p className="text-muted-foreground text-sm">Not available yet</p>
        </div>
        <Button variant="outline" disabled>
          Change password
        </Button>
      </div>
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-destructive text-sm font-medium">Delete account</p>
          <p className="text-muted-foreground text-sm">Not available yet</p>
        </div>
        <Button variant="destructive" disabled>
          Delete account
        </Button>
      </div>
    </div>
  );
}
