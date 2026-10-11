"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWorkspace } from "@/stores/workspace/provider";

export function AppearancePanel() {
  const { state, act } = useWorkspace();
  return (
    <Field>
      <FieldLabel id="settings-theme-label">Theme</FieldLabel>
      <FieldDescription>
        Choose how Dayplan looks. System follows your device’s appearance.
      </FieldDescription>
      <ToggleGroup
        aria-labelledby="settings-theme-label"
        value={[state.theme]}
        variant="outline"
        className="w-full flex-wrap"
        onValueChange={(values) => {
          const theme = values[0];
          if (theme === "system" || theme === "light" || theme === "dark")
            act({ type: "theme", theme });
        }}
      >
        <ToggleGroupItem value="system" className="flex-1">
          <Monitor />
          System
        </ToggleGroupItem>
        <ToggleGroupItem value="light" className="flex-1">
          <Sun />
          Light
        </ToggleGroupItem>
        <ToggleGroupItem value="dark" className="flex-1">
          <Moon />
          Dark
        </ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}
