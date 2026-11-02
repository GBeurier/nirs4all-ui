import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/** A file chosen by drop or picker; `name` keeps its path inside a dropped or chosen folder. */
export interface DroppedFile {
  name: string;
  file: File;
}

/** Hidden files (.DS_Store, .git/…) never belong to a dataset. */
const visible = (picked: DroppedFile) => !picked.name.split("/").some((part) => part.startsWith("."));

/** Files of a file input, with their folder-relative path when a folder was chosen. */
export function pickedFiles(list: ArrayLike<File> | null | undefined): DroppedFile[] {
  return Array.from(list ?? []).map((file) => ({ name: file.webkitRelativePath || file.name, file })).filter(visible);
}

async function readEntries(entries: FileSystemEntry[]): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    // hidden files and folders are skipped before any read
    if (entry.name.startsWith(".")) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ name: entry.fullPath.replace(/^\//, ""), file });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) return;
      for (const child of batch) await walk(child);
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}

/**
 * Files of a drop, dropped folders read recursively. Call it synchronously from the drop
 * handler: the browser invalidates the drag data once the event returns.
 */
export function droppedFiles(transfer: DataTransfer): Promise<DroppedFile[]> {
  const entries = Array.from(transfer.items ?? [])
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (!entries.length) return Promise.resolve(pickedFiles(transfer.files));
  return readEntries(entries);
}

export interface DatasetDropzoneProps {
  /** Called with every dropped or chosen file (folders expanded). */
  onFiles: (files: DroppedFile[]) => void;
  /** A dropped folder could not be read. */
  onError?: (error: unknown) => void;
  title?: ReactNode;
  /** Usually "or browse — formats"; rendered under the title. */
  hint?: ReactNode;
  /** Shows a folder picker button with this label under the zone. */
  folderLabel?: string;
  busy?: boolean;
  busyTitle?: ReactNode;
  busyHint?: ReactNode;
  error?: ReactNode;
  /** Small reassurance line, e.g. that files never leave the browser. */
  note?: ReactNode;
  /** Highlights the zone while the host tracks a page-level drag. */
  active?: boolean;
  accept?: string;
  icon?: ReactNode;
  busyIcon?: ReactNode;
  className?: string;
}

const UPLOAD_ICON = (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Ecosystem dataset drop zone (Studio, Web, QualiNIRS, IO): dashed teal target with a spectral
 * hairline, drag highlight, click/keyboard file picker, an optional folder picker button under the
 * zone, and a busy state (host `busy` or a dropped folder being listed) that replaces the icon by a
 * spinner. It only lists the files the user hands over; parsing and assembly stay in the host.
 */
export function DatasetDropzone({
  onFiles, onError, title = "Drop your spectra here", hint, folderLabel, busy = false, busyTitle = "Reading your dataset…",
  busyHint, error, note, active = false, accept, icon = UPLOAD_ICON, busyIcon, className,
}: DatasetDropzoneProps) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // a dropped folder is read asynchronously; overlapping drops are refused until it is done
  const reading = useRef(false);
  const [readingDrop, setReadingDrop] = useState(false);
  const blocked = busy || readingDrop;
  const open = () => { if (!blocked) files.current?.click(); };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
  };
  const highlighted = (dragging || active) && !blocked;
  return (
    <div className={["n4dz", className].filter(Boolean).join(" ")}>
      <div
        className="n4dz-zone"
        role="button"
        tabIndex={0}
        aria-disabled={blocked}
        aria-busy={blocked}
        data-active={highlighted || undefined}
        data-busy={blocked || undefined}
        onClick={open}
        onKeyDown={onKey}
        onDragOver={(event) => { event.preventDefault(); if (!blocked) setDragging(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          if (busy || reading.current) return;
          reading.current = true;
          setReadingDrop(true);
          droppedFiles(event.dataTransfer)
            .then(onFiles, (cause: unknown) => onError?.(cause))
            .finally(() => { reading.current = false; setReadingDrop(false); });
        }}
      >
        <span className="n4dz-hairline" aria-hidden="true" />
        <span className="n4dz-icon" aria-hidden="true">{blocked ? (busyIcon ?? <span className="n4dz-spinner" />) : icon}</span>
        <span className="n4dz-text" role={blocked ? "status" : undefined} aria-live={blocked ? "polite" : undefined}>
          <span className="n4dz-title">{blocked ? busyTitle : title}</span>
          {blocked ? (busyHint ? <span className="n4dz-hint">{busyHint}</span> : null) : (hint ? <span className="n4dz-hint">{hint}</span> : null)}
        </span>
      </div>
      {folderLabel ? (
        <button type="button" className="n4dz-link n4dz-folder" disabled={blocked} onClick={() => folder.current?.click()}>{folderLabel}</button>
      ) : null}
      <input ref={files} type="file" multiple accept={accept} hidden tabIndex={-1} onChange={(event) => { onFiles(pickedFiles(event.target.files)); event.target.value = ""; }} />
      {folderLabel ? <input ref={folder} type="file" multiple hidden tabIndex={-1} {...{ webkitdirectory: "" }} onChange={(event) => { onFiles(pickedFiles(event.target.files)); event.target.value = ""; }} /> : null}
      {error ? <div className="n4dz-error" role="alert">{error}</div> : null}
      {note ? <p className="n4dz-note">{note}</p> : null}
    </div>
  );
}
