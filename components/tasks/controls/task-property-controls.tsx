"use client";

import {
  CalendarDays,
  CalendarX,
  Flag,
  Folder,
  Inbox,
  Repeat2,
  Tag,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { taskInteractionBoundary } from "@/components/tasks/task-interaction";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dateKey, formatDate, parseDay, timeLabel } from "@/lib/dates";
import { tagIndex } from "@/lib/tags/hierarchy";
import { deadlineLabel, scheduleLabel } from "@/lib/tasks/presentation";
import { cn } from "@/lib/utils";
import { type DateValue } from "@/types-and-constants/dates";
import { priorities } from "@/types-and-constants/tasks";
import {
  type Occurrence,
  type RecurrenceRule,
} from "@/types-and-constants/tasks";
import { type Workspace } from "@/types-and-constants/workspace";

type DraftControl = {
  draft: Occurrence;
  patch: (change: Partial<Occurrence>) => void;
};

export function EditorSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; icon?: ReactNode }[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(value) => {
          if (value !== null) onChange(value);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.icon}
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function PropertyPopover({
  label,
  children,
  icon,
  title,
  triggerContent,
  iconOnly = false,
}: {
  label: string;
  children: ReactNode;
  icon: ReactNode;
  title: string;
  triggerContent?: ReactNode;
  iconOnly?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={iconOnly ? "icon-sm" : "sm"}
            className={
              iconOnly
                ? "shrink-0"
                : triggerContent
                  ? "max-w-full justify-start"
                  : "max-w-full"
            }
          />
        }
        aria-label={iconOnly ? label : undefined}
        title={label}
      >
        {iconOnly
          ? icon
          : (triggerContent ?? (
              <>
                {icon}
                <span className="truncate">{label}</span>
              </>
            ))}
      </PopoverTrigger>
      <PopoverContent
        {...taskInteractionBoundary}
        align="start"
        className="max-h-[min(32rem,80dvh,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
      >
        <PopoverTitle>{title}</PopoverTitle>
        <FieldGroup>{children}</FieldGroup>
      </PopoverContent>
    </Popover>
  );
}

export function PriorityFields({ draft, patch }: DraftControl) {
  return (
    <ToggleGroup
      aria-label="Priority"
      orientation="vertical"
      value={[draft.priority]}
      onValueChange={(values) => {
        if (values[0]) patch({ priority: values[0] as Occurrence["priority"] });
      }}
      className="w-full"
      variant="outline"
    >
      {[...priorities].reverse().map((priority) => (
        <ToggleGroupItem
          key={priority}
          value={priority}
          onClick={() => {
            if (draft.priority === priority) patch({ priority });
          }}
          className="justify-start"
        >
          <Flag
            data-icon="inline-start"
            className="text-(--priority-color)"
            data-priority={priority}
          />
          {priority === "none"
            ? "No priority"
            : priority[0].toUpperCase() + priority.slice(1)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
export function PriorityPicker({ draft, patch }: DraftControl) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" />}
        aria-label={`Priority: ${draft.priority}`}
      >
        <Flag
          className="text-(--priority-color)"
          data-priority={draft.priority}
        />
      </PopoverTrigger>
      <PopoverContent {...taskInteractionBoundary} align="end">
        <PopoverTitle>Priority</PopoverTitle>
        <PriorityFields
          draft={draft}
          patch={(change) => {
            patch(change);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function TaskDatePicker({
  draft,
  patch,
  today,
  mode,
  recurrenceLocked = false,
}: DraftControl & {
  today: string;
  mode: "deadline" | "schedule";
  recurrenceLocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const value = draft[mode];
  const label = mode === "schedule" ? "Schedule" : "Deadline";
  const Icon = mode === "schedule" ? CalendarDays : CalendarX;
  const dateLabel =
    mode === "schedule"
      ? draft.schedule &&
        scheduleLabel(draft.schedule, today).replace(/^Scheduled /, "")
      : draft.deadline &&
        deadlineLabel(draft.deadline, today).replace(/^Due /, "");
  const compactLabel = value
    ? `${formatDate(value.date)}${value.time ? ` ${timeLabel(value.time)}` : ""}`
    : label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground max-w-full min-w-0 justify-start data-set:text-(--date-set)"
          />
        }
        aria-label={`${label}: ${dateLabel || "Not set"}`}
        title={`${label}: ${dateLabel || "Not set"}`}
        data-set={!!value || undefined}
      >
        <Icon data-icon="inline-start" />
        <span className="truncate">{compactLabel}</span>
        {mode === "schedule" && draft.recurrence && (
          <Repeat2 data-icon="inline-end" aria-label="Repeating task" />
        )}
      </PopoverTrigger>
      <PopoverContent
        {...taskInteractionBoundary}
        align="start"
        className="max-h-[min(36rem,85dvh,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
      >
        <PopoverTitle>
          {mode === "schedule" ? "Scheduled work" : "Deadline"}
        </PopoverTitle>
        <TaskDateFields
          draft={draft}
          patch={patch}
          mode={mode}
          recurrenceLocked={recurrenceLocked}
          close={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export function TaskDateFields({
  draft,
  patch,
  mode,
  recurrenceLocked = false,
  close,
}: DraftControl & {
  mode: "deadline" | "schedule";
  recurrenceLocked?: boolean;
  close: () => void;
}) {
  const id = useId();
  const value = draft[mode];
  function change(value: DateValue | undefined) {
    if (mode === "schedule")
      patch({
        schedule: value
          ? { ...value, duration: draft.schedule?.duration ?? 30 }
          : undefined,
      });
    else patch({ deadline: value });
  }
  return (
    <>
      <Calendar
        key={mode}
        mode="single"
        selected={value ? parseDay(value.date) : undefined}
        defaultMonth={value ? parseDay(value.date) : undefined}
        onSelect={(date) =>
          change(date ? { date: dateKey(date), time: value?.time } : undefined)
        }
        className="self-center"
      />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-time`}>
            {mode === "schedule"
              ? "Start time (optional)"
              : "Due time (optional)"}
          </FieldLabel>
          <Input
            id={`${id}-time`}
            type="time"
            disabled={!value}
            value={value?.time ?? ""}
            onChange={(event) =>
              value &&
              change({ ...value, time: event.target.value || undefined })
            }
          />
        </Field>
        {mode === "schedule" && draft.schedule?.time && (
          <Field>
            <FieldLabel htmlFor={`${id}-duration`}>
              Duration (minutes)
            </FieldLabel>
            <Input
              id={`${id}-duration`}
              type="number"
              min={15}
              max={1440}
              step={15}
              value={draft.schedule.duration}
              onChange={(event) =>
                patch({
                  schedule: {
                    ...draft.schedule!,
                    duration: Math.max(
                      15,
                      Math.min(1440, Number(event.target.value) || 30),
                    ),
                  },
                })
              }
            />
          </Field>
        )}
        {mode === "schedule" && (
          <TaskRecurrenceFields
            draft={draft}
            patch={patch}
            locked={recurrenceLocked}
          />
        )}
      </FieldGroup>
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!value}
          onClick={() => change(undefined)}
        >
          Clear {mode === "deadline" ? "deadline" : "schedule"}
        </Button>
        <Button type="button" size="sm" onClick={() => close()}>
          Done
        </Button>
      </div>
    </>
  );
}

export function TaskLocationPicker({
  draft,
  patch,
  state,
}: DraftControl & { state: Workspace }) {
  const selectedProject = state.projects.find(
    (item) => item.id === draft.projectId,
  );
  const project = selectedProject?.name ?? "Inbox";
  const section = state.sections.find(
    (item) => item.id === draft.sectionId,
  )?.name;
  return (
    <PropertyPopover
      title="Location"
      label={`${project}${section ? ` / ${section}` : ""}`}
      icon={
        selectedProject ? (
          <Folder
            className="text-(--entity-color)"
            data-color={selectedProject.color}
          />
        ) : (
          <Inbox className="text-muted-foreground" />
        )
      }
      iconOnly
    >
      <TaskLocationFields draft={draft} patch={patch} state={state} />
    </PropertyPopover>
  );
}

export function TaskLocationFields({
  draft,
  patch,
  state,
}: DraftControl & { state: Workspace }) {
  return (
    <>
      {draft.context && (
        <p className="text-muted-foreground text-sm">
          Location changes apply to the entire series.
        </p>
      )}
      <EditorSelect
        label="Project"
        value={draft.projectId ?? ""}
        onChange={(value) =>
          patch({ parentId: null, projectId: value || null, sectionId: null })
        }
        options={[
          {
            value: "",
            label: "Inbox",
            icon: <Inbox className="text-muted-foreground" />,
          },
          ...state.projects.map((item) => ({
            value: item.id,
            label: item.name,
            icon: (
              <Folder
                className="text-(--entity-color)"
                data-color={item.color}
              />
            ),
          })),
        ]}
      />
      <EditorSelect
        label="Section"
        value={draft.sectionId ?? ""}
        onChange={(value) =>
          patch({ parentId: null, sectionId: value || null })
        }
        options={[
          { value: "", label: "Unsectioned" },
          ...state.sections
            .filter((item) => item.projectId === draft.projectId)
            .sort((a, b) => a.order - b.order)
            .map((item) => ({ value: item.id, label: item.name })),
        ]}
      />
    </>
  );
}

export function TaskTagsPicker({
  draft,
  patch,
  state,
}: DraftControl & { state: Workspace }) {
  const [query, setQuery] = useState("");
  const index = tagIndex(state.tags);
  const options = index.rows.filter(({ tag }) =>
    index.path(tag.id).toLowerCase().includes(query.toLowerCase().trim()),
  );
  return (
    <FieldSet className="min-w-0 gap-2">
      <FieldLegend variant="label">Tags</FieldLegend>
      <Input
        aria-label="Search tags"
        placeholder="Search tags and paths"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="text-muted-foreground text-xs">
        Select direct assignments. Parent filters include subtags automatically.
      </p>
      {state.tags.length ? (
        <ToggleGroup
          aria-label="Task tags"
          multiple
          value={draft.tagIds}
          onValueChange={(values) => {
            const shown = new Set(options.map(({ tag }) => tag.id));
            patch({
              tagIds: [
                ...new Set([
                  ...draft.tagIds.filter((id) => !shown.has(id)),
                  ...values,
                ]),
              ],
            });
          }}
          variant="outline"
          size="sm"
          className="w-full flex-wrap"
        >
          {options.map(({ tag }) => {
            const selected = draft.tagIds.includes(tag.id);
            return (
              <ToggleGroupItem
                key={tag.id}
                value={tag.id}
                title={index.path(tag.id)}
                className={cn(
                  "rounded-4xl",
                  !selected && "text-muted-foreground",
                )}
              >
                <Tag
                  data-icon="inline-start"
                  className={
                    selected
                      ? "tag-icon text-(--entity-color) opacity-75"
                      : "tag-icon text-muted-foreground"
                  }
                  data-color={tag.color}
                  aria-hidden="true"
                />
                <span className="truncate">{index.path(tag.id)}</span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      ) : (
        <p className="text-muted-foreground text-sm">
          Create tags in the sidebar to organize your tasks.
        </p>
      )}
    </FieldSet>
  );
}

function TaskRecurrenceFields({
  draft,
  patch,
  locked,
}: DraftControl & { locked: boolean }) {
  const id = useId();
  const labels = {
    daily: "Every day",
    weekdays: "Selected weekdays",
    weekly: "Every week",
    monthly: "Every month",
  };
  return (
    <FieldSet>
      <FieldLegend variant="label">Repeat</FieldLegend>
      {locked && (
        <p className="text-muted-foreground text-sm">
          Select Entire series to change the repeat rule.
        </p>
      )}
      <EditorSelect
        label="Frequency"
        disabled={locked}
        value={draft.recurrence?.frequency ?? ""}
        onChange={(value) =>
          patch({
            recurrence:
              value === ""
                ? undefined
                : {
                    frequency: value as RecurrenceRule["frequency"],
                    weekdays: draft.recurrence?.weekdays ?? [1, 2, 3, 4, 5],
                    until: draft.recurrence?.until,
                  },
          })
        }
        options={[
          { value: "", label: "Does not repeat" },
          ...Object.entries(labels).map(([value, label]) => ({ value, label })),
        ]}
      />
      {draft.recurrence?.frequency === "weekdays" && (
        <Field>
          <FieldLabel>Repeat on</FieldLabel>
          <ToggleGroup
            multiple
            disabled={locked}
            value={draft.recurrence.weekdays.map(String)}
            onValueChange={(values) =>
              patch({
                recurrence: {
                  ...draft.recurrence!,
                  weekdays: values.map(Number),
                },
              })
            }
            variant="outline"
            size="sm"
            aria-label="Repeat weekdays"
            className="flex-wrap"
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day, index) => (
                <ToggleGroupItem key={day} value={String(index)}>
                  {day}
                </ToggleGroupItem>
              ),
            )}
          </ToggleGroup>
        </Field>
      )}
      {draft.recurrence && (
        <Field>
          <FieldLabel htmlFor={id}>Repeat until (optional)</FieldLabel>
          <Input
            id={id}
            type="date"
            disabled={locked}
            value={draft.recurrence.until ?? ""}
            onChange={(event) =>
              patch({
                recurrence: {
                  ...draft.recurrence!,
                  until: event.target.value || undefined,
                },
              })
            }
          />
        </Field>
      )}
    </FieldSet>
  );
}
