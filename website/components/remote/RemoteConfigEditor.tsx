"use client";

import { useEffect, useId, useState } from "react";
import { TbArrowBackUp, TbPlus, TbTrash } from "react-icons/tb";
import {
  type ConfigObject,
  type ConfigSchema,
  type ConfigValue,
  isConfigObject,
  nodeDefault,
  parseRemoteYaml,
  stringifyRemoteYaml,
  validateConfig,
  validDynamicKey,
} from "@/lib/remote-spawnerx";

function valueLabel(value: ConfigValue | undefined): string {
  if (value === undefined) return "Não definido";
  if (typeof value === "boolean") return value ? "Ativado" : "Desativado";
  if (Array.isArray(value))
    return value.length ? value.join(", ") : "Lista vazia";
  if (isConfigObject(value)) return `${Object.keys(value).length} propriedades`;
  return String(value ?? "");
}

export function ConfigField({
  schema,
  value,
  onChange,
  disabled,
  path,
  defaultValue,
  removable = false,
  onRemove,
}: {
  schema: ConfigSchema;
  value: ConfigValue | undefined;
  onChange: (value: ConfigValue) => void;
  disabled: boolean;
  path: string;
  defaultValue?: ConfigValue;
  removable?: boolean;
  onRemove?: () => void;
}) {
  const id = useId();
  const [newKey, setNewKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const current = value ?? nodeDefault(schema);
  const defaults = defaultValue ?? schema.default;
  const title = schema.title || path.split(".").at(-1) || "Propriedade";
  const errors = validateConfig(current, schema, path);
  const reset = () =>
    onChange(
      defaults === undefined ? nodeDefault(schema) : structuredClone(defaults),
    );
  const tools = (
    <span className="remote-field__tools">
      {defaults !== undefined && (
        <button
          type="button"
          className="remote-icon-button"
          disabled={disabled}
          onClick={reset}
          title={`Restaurar padrão de ${title}`}
          aria-label={`Restaurar padrão de ${title}`}
        >
          <TbArrowBackUp aria-hidden="true" size={15} />
        </button>
      )}
      {removable && onRemove && (
        <button
          type="button"
          className="remote-icon-button remote-danger-text"
          disabled={disabled}
          onClick={onRemove}
          title={`Remover ${title}`}
          aria-label={`Remover ${title}`}
        >
          <TbTrash aria-hidden="true" size={15} />
        </button>
      )}
    </span>
  );
  if (schema.type === "object") {
    const object = isConfigObject(current) ? current : {};
    const defaultObject = isConfigObject(defaults) ? defaults : {};
    const properties = schema.properties ?? {};
    const keys = [
      ...new Set([...Object.keys(properties), ...Object.keys(object)]),
    ];
    const template = schema.additionalProperties || null;
    return (
      <details className="remote-group" open={path.split(".").length < 3}>
        <summary>
          <span>
            <strong>{title}</strong>
            <small>{schema.description || path}</small>
          </span>
          <span className="remote-group__count">
            {Object.keys(object).length}
          </span>
        </summary>
        <div className="remote-group__body">
          {keys.map((key) => {
            const known = Object.hasOwn(properties, key);
            const child = known ? properties[key] : template;
            if (!child) return null;
            const missing =
              !(key in object) &&
              child.default === undefined &&
              !(key in defaultObject);
            if (missing && known)
              return (
                <button
                  key={key}
                  className="remote-add-property"
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({ ...object, [key]: nodeDefault(child) })
                  }
                >
                  <TbPlus aria-hidden="true" /> {child.title || key}{" "}
                  <small>Propriedade opcional</small>
                </button>
              );
            return (
              <ConfigField
                key={key}
                path={`${path}.${key}`}
                schema={child}
                value={object[key]}
                defaultValue={defaultObject[key]}
                disabled={disabled}
                onChange={(next) => onChange({ ...object, [key]: next })}
                removable={!known}
                onRemove={() => {
                  const next = { ...object };
                  delete next[key];
                  onChange(next);
                }}
              />
            );
          })}
          {template && (
            <div className="remote-map-add">
              <label htmlFor={`${id}-key`}>Novo identificador</label>
              <div>
                <input
                  id={`${id}-key`}
                  value={newKey}
                  onChange={(event) => {
                    setNewKey(event.target.value);
                    setKeyError("");
                  }}
                  maxLength={64}
                  disabled={disabled}
                  placeholder="Use um identificador único"
                />
                <button
                  type="button"
                  className="remote-button"
                  disabled={disabled || !newKey.trim()}
                  onClick={() => {
                    const key = newKey.trim();
                    if (!validDynamicKey(key)) {
                      setKeyError(
                        "Use letras, números, _ ou -, até 64 caracteres.",
                      );
                      return;
                    }
                    if (key in object) {
                      setKeyError("Este identificador já existe.");
                      return;
                    }
                    onChange({ ...object, [key]: nodeDefault(template) });
                    setNewKey("");
                  }}
                >
                  <TbPlus aria-hidden="true" /> Adicionar
                </button>
              </div>
              {keyError && (
                <p role="alert" className="remote-error-text">
                  {keyError}
                </p>
              )}
            </div>
          )}
        </div>
      </details>
    );
  }
  if (schema.type === "array") {
    const list = Array.isArray(current) ? current : [];
    return (
      <fieldset className="remote-field remote-list">
        <legend>{title}</legend>
        <p className="remote-field__help">{schema.description}</p>
        {list.map((item, index) => (
          // Entries use their position because they have no persistent identity in the YAML document.
          // biome-ignore lint/suspicious/noArrayIndexKey: Configuration list entries are ordered scalar values.
          <div key={index} className="remote-list__item">
            <ConfigField
              path={`${path}[${index}]`}
              schema={
                schema.items ?? {
                  type: "string",
                  title: `Entrada ${index + 1}`,
                  description: "Valor da lista",
                }
              }
              value={item}
              disabled={disabled}
              onChange={(next) =>
                onChange(
                  list.map((entry, position) =>
                    position === index ? next : entry,
                  ),
                )
              }
            />
            <button
              className="remote-icon-button remote-danger-text"
              type="button"
              disabled={disabled}
              aria-label={`Remover entrada ${index + 1} de ${title}`}
              onClick={() =>
                onChange(list.filter((_, position) => position !== index))
              }
            >
              <TbTrash aria-hidden="true" />
            </button>
          </div>
        ))}
        {!list.length && (
          <p className="remote-muted">
            Nenhuma entrada. Uma lista vazia mantém o comportamento informado na
            descrição.
          </p>
        )}
        <div className="remote-row">
          <button
            type="button"
            className="remote-button"
            disabled={disabled || list.length >= 500}
            onClick={() =>
              onChange([
                ...list,
                nodeDefault(
                  schema.items ?? {
                    type: "string",
                    title: "Entrada",
                    description: "",
                  },
                ),
              ])
            }
          >
            <TbPlus aria-hidden="true" /> Adicionar entrada
          </button>
          {tools}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="remote-field" data-invalid={errors.length > 0}>
      <div className="remote-field__heading">
        <label htmlFor={id}>{title}</label>
        {tools}
      </div>
      <p id={`${id}-help`} className="remote-field__help">
        {schema.description || path}
      </p>
      {schema.type === "boolean" ? (
        <label className="remote-switch" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            role="switch"
            aria-checked={current === true}
            checked={current === true}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby={`${id}-help`}
          />
          <span aria-hidden="true" />
          <strong>{current === true ? "Ativado" : "Desativado"}</strong>
        </label>
      ) : schema.enum ? (
        <select
          id={id}
          value={String(current)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-help`}
        >
          {schema.enum.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : schema.type === "number" ? (
        <input
          id={id}
          type="number"
          value={typeof current === "number" ? current : ""}
          min={schema.minimum}
          max={schema.maximum}
          step={schema.integer ? 1 : "any"}
          disabled={disabled}
          aria-invalid={errors.length > 0}
          aria-describedby={`${id}-help`}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? Number.NaN
                : Number(event.target.value),
            )
          }
        />
      ) : (
        <input
          id={id}
          type="text"
          value={typeof current === "string" ? current : ""}
          maxLength={8192}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-help`}
          spellCheck={false}
        />
      )}
      <div className="remote-field__meta">
        <span>
          Padrão: <code>{valueLabel(defaults)}</code>
        </span>
        <span>
          {(schema.requires ?? schema.reload) === "RESTART"
            ? "Exige reinicialização"
            : "Aplicação com reload"}
        </span>
      </div>
      {errors.length > 0 && (
        <p className="remote-error-text" role="alert">
          {errors[0]}
        </p>
      )}
    </div>
  );
}

function YamlHighlight({ value }: { value: string }) {
  return (
    <pre className="remote-yaml-highlight" aria-hidden="true">
      {value.split("\n").map((line, index) => {
        const separator = line.indexOf(":");
        return (
          <span className="remote-yaml-line" key={`${index}-${line}`}>
            <i>{index + 1}</i>
            {line.trimStart().startsWith("#") ? (
              <span className="remote-yaml-comment">{line}</span>
            ) : separator >= 0 ? (
              <>
                <span className="remote-yaml-key">
                  {line.slice(0, separator + 1)}
                </span>
                <span>{line.slice(separator + 1)}</span>
              </>
            ) : (
              <span>{line}</span>
            )}
          </span>
        );
      })}
    </pre>
  );
}

export function AdvancedYamlEditor({
  value,
  schema,
  onChange,
  disabled,
  title,
}: {
  value: ConfigObject;
  schema: ConfigSchema;
  onChange: (value: ConfigObject) => void;
  disabled: boolean;
  title: string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!dirty)
      void stringifyRemoteYaml(value).then((result) => {
        if (!cancelled) setText(result);
      });
    return () => {
      cancelled = true;
    };
  }, [value, dirty]);
  const validate = async () => {
    setBusy(true);
    setError("");
    try {
      const parsed = await parseRemoteYaml(text, schema);
      onChange(parsed);
      setDirty(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "YAML inválido.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="remote-panel">
      <header className="remote-section-heading">
        <div>
          <h3>YAML avançado · {title}</h3>
          <p>
            Edite apenas as propriedades públicas suportadas. Credenciais e
            dados internos não fazem parte deste documento.
          </p>
        </div>
      </header>
      <label htmlFor={id}>Documento YAML</label>
      <textarea
        id={id}
        className="remote-yaml-input"
        value={text}
        spellCheck={false}
        disabled={disabled || busy}
        onChange={(event) => {
          setText(event.target.value);
          setDirty(true);
          setError("");
        }}
        aria-describedby={`${id}-status`}
      />
      <details className="remote-yaml-preview">
        <summary>Realce de sintaxe e números de linha</summary>
        <YamlHighlight value={text} />
      </details>
      <div className="remote-row">
        <button
          type="button"
          className="remote-button remote-button--primary"
          disabled={disabled || busy || !dirty}
          onClick={() => void validate()}
        >
          {busy ? "Validando…" : "Validar e atualizar formulário"}
        </button>
        <button
          type="button"
          className="remote-button"
          disabled={!dirty || busy}
          onClick={() => {
            setDirty(false);
            setError("");
          }}
        >
          Descartar edição YAML
        </button>
      </div>
      <p
        id={`${id}-status`}
        className={error ? "remote-error-text" : "remote-muted"}
        role={error ? "alert" : "status"}
      >
        {error ||
          (dirty
            ? "A edição YAML ainda não foi transferida para o formulário. Valide antes de salvar."
            : "Formulário e YAML sincronizados. Salvar no site ainda não aplica ao servidor.")}
      </p>
    </section>
  );
}

export function RemoteConfigEditor({
  value,
  schema,
  defaults,
  disabled,
  onChange,
  document = "config",
}: {
  value: ConfigObject;
  schema: ConfigSchema;
  defaults: ConfigObject;
  disabled: boolean;
  onChange: (value: ConfigObject) => void;
  document?: "config" | "shop";
}) {
  const [advanced, setAdvanced] = useState(false);
  return (
    <div className="remote-editor">
      <div className="remote-editor__mode">
        <fieldset aria-label={`Modo de edição de ${document}.yml`}>
          <button
            type="button"
            aria-pressed={!advanced}
            onClick={() => setAdvanced(false)}
          >
            Editor visual
          </button>
          <button
            type="button"
            aria-pressed={advanced}
            onClick={() => setAdvanced(true)}
          >
            YAML avançado
          </button>
        </fieldset>
        <span>Schema da versão instalada</span>
      </div>
      {advanced ? (
        <AdvancedYamlEditor
          value={value}
          schema={schema}
          disabled={disabled}
          onChange={onChange}
          title={`${document}.yml`}
        />
      ) : (
        <ConfigField
          path={document}
          value={value}
          schema={schema}
          defaultValue={defaults}
          disabled={disabled}
          onChange={(next) => {
            if (isConfigObject(next)) onChange(next);
          }}
        />
      )}
    </div>
  );
}
