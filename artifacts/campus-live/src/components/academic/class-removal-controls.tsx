"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClassesQueryKey,
  getGetSectionsQueryKey,
  useRemoveClass,
  useRemoveSection,
  useSetClassActivity,
  useSetSectionActivity,
} from "@workspace/api-client-react";

const invalidateAcademicLists = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetClassesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetSectionsQueryKey() }),
  ]);

export function ClassRemovalControls({
  classId,
  className,
  isActive,
  onComplete,
}: {
  classId: string;
  className: string;
  isActive: boolean;
  onComplete: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useRemoveClass({
    mutation: {
      onSuccess: async (result) => {
        await invalidateAcademicLists(queryClient);
        onComplete(result.outcome === "deleted"
          ? `${className} and its empty sections were permanently deleted.`
          : `${className} was archived. Its records were kept.`);
      },
    },
  });
  const restore = useSetClassActivity({
    mutation: {
      onSuccess: async () => {
        await invalidateAcademicLists(queryClient);
        onComplete(`${className} was restored.`);
      },
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      {isActive ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(
              `Remove ${className} from active classes? If it has linked records, it will be archived and those records will be kept. If it has no linked records, the class and its empty sections will be permanently deleted.`,
            )) {
              remove.mutate({ classId });
            }
          }}
        >
          {remove.isPending ? "Removing…" : "Remove class"}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-muted btn-sm"
          disabled={restore.isPending}
          onClick={() => restore.mutate({ classId, data: { isActive: true } })}
        >
          {restore.isPending ? "Restoring…" : "Restore class"}
        </button>
      )}
      {remove.isError && <span role="alert" className="max-w-xs text-right text-[10px] text-[hsl(var(--destructive))]">{remove.error.message}</span>}
      {restore.isError && <span role="alert" className="max-w-xs text-right text-[10px] text-[hsl(var(--destructive))]">{restore.error.message}</span>}
    </div>
  );
}

export function SectionRemovalControls({
  sectionId,
  sectionName,
  isActive,
  classIsActive,
  onComplete,
}: {
  sectionId: string;
  sectionName: string;
  isActive: boolean;
  classIsActive: boolean;
  onComplete: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useRemoveSection({
    mutation: {
      onSuccess: async (result) => {
        await invalidateAcademicLists(queryClient);
        onComplete(result.outcome === "deleted"
          ? `Section ${sectionName} was permanently deleted.`
          : `${sectionName} was archived. Its records were kept.`);
      },
    },
  });
  const restore = useSetSectionActivity({
    mutation: {
      onSuccess: async () => {
        await invalidateAcademicLists(queryClient);
        onComplete(`${sectionName} was restored.`);
      },
    },
  });

  if (!classIsActive) {
    return <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Restore the class first to manage this section.</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {isActive ? (
        <button
          type="button"
          className="btn btn-quiet btn-sm text-[hsl(var(--destructive))]"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(
              `Remove section ${sectionName}? If it has linked records, it will be archived and those records will be kept. If it has no linked records, it will be permanently deleted.`,
            )) {
              remove.mutate({ sectionId });
            }
          }}
        >
          {remove.isPending ? "Removing…" : "Remove section"}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-muted btn-sm"
          disabled={restore.isPending}
          onClick={() => restore.mutate({ sectionId, data: { isActive: true } })}
        >
          {restore.isPending ? "Restoring…" : "Restore section"}
        </button>
      )}
      {remove.isError && <span role="alert" className="max-w-xs text-right text-[10px] text-[hsl(var(--destructive))]">{remove.error.message}</span>}
      {restore.isError && <span role="alert" className="max-w-xs text-right text-[10px] text-[hsl(var(--destructive))]">{restore.error.message}</span>}
    </div>
  );
}
