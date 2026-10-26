"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TbCheck, TbPalette, TbX } from "react-icons/tb";
import { siteThemes } from "@/lib/site-themes";
import { useSiteAppearance } from "./useSiteAppearance";

export function SiteAppearanceDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { theme, motion, setTheme, setMotion } = useSiteAppearance();
  const titleId = useId();
  const descriptionId = useId();
  const groupName = useId();
  const activeTheme =
    siteThemes.find((entry) => entry.id === theme) ?? siteThemes[0];

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function openDialog() {
    if (!dialogRef.current || dialogRef.current.open) return;
    dialogRef.current.showModal();
    setIsOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className="appearance-trigger"
        onClick={openDialog}
        aria-label={`Personalizar aparência. Tema atual: ${activeTheme.name}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Personalizar aparência"
      >
        <TbPalette size={17} aria-hidden="true" />
        <span className="hidden lg:inline">Aparência</span>
      </button>
      <dialog
        ref={dialogRef}
        className="appearance-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => setIsOpen(false)}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          ) {
            event.currentTarget.close();
          }
        }}
      >
        <header className="appearance-dialog__header">
          <div>
            <p className="appearance-eyebrow">Seu espaço, seu mundo</p>
            <h2 id={titleId}>Aparência</h2>
            <p id={descriptionId}>
              Escolha a atmosfera que acompanha sua navegação.
            </p>
          </div>
          <button
            type="button"
            className="appearance-close"
            onClick={() => dialogRef.current?.close()}
            aria-label="Fechar aparência"
          >
            <TbX size={20} aria-hidden="true" />
          </button>
        </header>
        <fieldset className="appearance-options">
          <legend className="sr-only">Tema do site</legend>
          {siteThemes.map((entry) => (
            <label
              key={entry.id}
              className="appearance-option"
              data-theme-preview={entry.id}
              data-selected={entry.id === theme ? "true" : "false"}
            >
              <input
                type="radio"
                name={groupName}
                value={entry.id}
                checked={theme === entry.id}
                onChange={() => setTheme(entry.id)}
                className="sr-only"
              />
              <span className="appearance-preview" aria-hidden="true">
                <span className="appearance-preview__moon" />
                <span className="appearance-preview__terrain" />
                <span className="appearance-preview__swatches">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="appearance-preview__world">{entry.world}</span>
              </span>
              <span className="appearance-option__body">
                <span className="appearance-option__title">
                  <span>{entry.name}</span>
                  <span className="appearance-option__check" aria-hidden="true">
                    <TbCheck size={14} />
                  </span>
                </span>
                <span className="appearance-option__description">
                  {entry.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="appearance-motion">
          <span>
            <span className="appearance-motion__title">Animação ambiente</span>
            <span className="appearance-motion__description">
              Movimento suave no cenário. Respeita a preferência de movimento do
              dispositivo.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={motion === "auto"}
            checked={motion === "auto"}
            onChange={(event) =>
              setMotion(event.target.checked ? "auto" : "off")
            }
            aria-label="Animação ambiente"
          />
        </label>
        <footer className="appearance-dialog__footer">
          <output aria-live="polite">{activeTheme.name} aplicado</output>
          <span>Salvo neste navegador</span>
        </footer>
      </dialog>
    </>
  );
}
