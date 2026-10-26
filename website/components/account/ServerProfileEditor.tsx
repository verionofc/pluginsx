"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TbCheck, TbLoader2, TbX } from "react-icons/tb";
import {
  isServerIcon,
  normalizeServerTags,
  type ServerIconId,
  type ServerProfileFields,
  type ServerProfilePatch,
  serverIcons,
} from "@/lib/server-profiles";
import { ServerItemIcon } from "./ServerItemIcon";

type EditableServer = ServerProfileFields & { id: string; name: string };
export function ServerProfileEditor({
  server,
  onSave,
  onClose,
}: {
  server: EditableServer;
  onSave: (patch: ServerProfilePatch) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const nameId = useId();
  const tagsId = useId();
  const iconName = useId();
  const [name, setName] = useState(server.displayName || server.name);
  const [tagsText, setTagsText] = useState((server.tags ?? []).join(", "));
  const [icon, setIcon] = useState<ServerIconId>(
    isServerIcon(server.icon) ? server.icon : "grass",
  );
  const [pinned, setPinned] = useState(Boolean(server.pinned));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewTags = normalizeServerTags(tagsText);

  useEffect(() => {
    dialogRef.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const unique = normalizeServerTags(tagsText);
    if (
      unique.length > 5 ||
      unique.some((tag) => tag.length > 24 || /[\p{Cc}<>]/u.test(tag))
    ) {
      setError(
        "Use até 5 tags de 24 caracteres, sem caracteres de controle ou < >.",
      );
      return;
    }
    if (name.trim().length > 100) {
      setError("O nome pode ter até 100 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        displayName: name.trim() === server.name ? "" : name.trim(),
        tags: unique,
        icon,
        pinned,
      });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar a identificação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="server-editor"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onCancel={(event) => {
        if (saving) event.preventDefault();
      }}
      onPointerDown={(event) => {
        if (saving || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          event.currentTarget.close();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <header className="server-editor__header">
          <div>
            <p className="server-editor__eyebrow">Organize seus mundos</p>
            <h2 id={titleId}>Identificação do servidor</h2>
            <p id={descriptionId}>
              Personalize como este servidor aparece na sua conta.
            </p>
          </div>
          <button
            type="button"
            className="server-editor__close"
            aria-label="Fechar identificação"
            disabled={saving}
            onClick={() => dialogRef.current?.close()}
          >
            <TbX size={20} aria-hidden="true" />
          </button>
        </header>
        <fieldset className="server-editor__fields" disabled={saving}>
          <label htmlFor={nameId}>Nome de exibição</label>
          <input
            id={nameId}
            name="displayName"
            aria-describedby={`${nameId}-hint`}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={server.name}
          />
          <p id={`${nameId}-hint`} className="server-editor__hint">
            Nome enviado pelo servidor: <strong>{server.name}</strong>. Deixe
            vazio para usar o original.
          </p>
          <label htmlFor={tagsId}>Tags</label>
          <input
            id={tagsId}
            name="tags"
            aria-describedby={`${tagsId}-hint`}
            value={tagsText}
            maxLength={140}
            onChange={(event) => setTagsText(event.target.value)}
            placeholder="Ex.: produção, survival, principal"
          />
          <p id={`${tagsId}-hint`} className="server-editor__hint">
            Separe por vírgulas. Até 5 tags de 24 caracteres.
          </p>
          {previewTags.length > 0 && (
            <ul className="server-tags" aria-label="Prévia das tags">
              {previewTags.slice(0, 5).map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}
          <fieldset className="server-editor__icons">
            <legend>Ícone do servidor</legend>
            {serverIcons.map((entry) => (
              <label key={entry.id} data-selected={icon === entry.id}>
                <input
                  type="radio"
                  className="sr-only"
                  name={iconName}
                  value={entry.id}
                  checked={icon === entry.id}
                  onChange={() => setIcon(entry.id)}
                />
                <ServerItemIcon icon={entry.id} />
                <span>{entry.label}</span>
                {icon === entry.id && (
                  <TbCheck
                    size={11}
                    className="server-editor__icon-check"
                    aria-hidden="true"
                  />
                )}
              </label>
            ))}
          </fieldset>
          <label className="server-editor__pin">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(event) => setPinned(event.target.checked)}
            />
            <span>Fixar no topo desta licença</span>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="server-editor__error">
            {error}
          </p>
        )}
        <footer className="server-editor__footer">
          <button
            type="button"
            className="server-editor__cancel"
            disabled={saving}
            onClick={() => dialogRef.current?.close()}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="server-editor__save"
            disabled={saving}
          >
            {saving ? (
              <TbLoader2
                className="animate-spin"
                size={16}
                aria-hidden="true"
              />
            ) : (
              <TbCheck size={16} aria-hidden="true" />
            )}
            {saving ? "Salvando…" : "Salvar identificação"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
