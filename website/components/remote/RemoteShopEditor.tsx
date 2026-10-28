"use client";

import { useId, useState } from "react";
import { TbCube, TbPlus, TbTrash } from "react-icons/tb";
import {
  type ConfigObject,
  type ConfigSchema,
  isConfigObject,
  nodeDefault,
  validDynamicKey,
} from "@/lib/remote-spawnerx";
import { AdvancedYamlEditor, ConfigField } from "./RemoteConfigEditor";

const emptySchema: ConfigSchema = {
  type: "object",
  title: "Loja",
  description: "",
  properties: {},
  additionalProperties: false,
};
function childObject(
  parent: ConfigObject | undefined,
  key: string,
): ConfigObject {
  return isConfigObject(parent?.[key]) ? parent[key] : {};
}
function AddEntry({
  label,
  options,
  onAdd,
  disabled,
  existing,
}: {
  label: string;
  options?: string[];
  onAdd: (key: string) => void;
  disabled: boolean;
  existing: string[];
}) {
  const id = useId();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="remote-map-add">
      <label htmlFor={id}>{label}</label>
      <div>
        {options ? (
          <select
            id={id}
            value={key}
            disabled={disabled}
            onChange={(event) => setKey(event.target.value)}
          >
            <option value="">Escolha uma entidade</option>
            {options
              .filter((option) => !existing.includes(option))
              .map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
          </select>
        ) : (
          <input
            id={id}
            value={key}
            maxLength={64}
            disabled={disabled}
            placeholder="Identificador único"
            onChange={(event) => {
              setKey(event.target.value);
              setError("");
            }}
          />
        )}
        <button
          type="button"
          className="remote-button"
          disabled={disabled || !key.trim()}
          onClick={() => {
            const normalized = key.trim();
            if (!validDynamicKey(normalized)) {
              setError("Use letras, números, _ ou - no identificador.");
              return;
            }
            if (existing.includes(normalized)) {
              setError("Este identificador já existe.");
              return;
            }
            onAdd(normalized);
            setKey("");
            setError("");
          }}
        >
          <TbPlus aria-hidden="true" /> Adicionar
        </button>
      </div>
      {error && (
        <p role="alert" className="remote-error-text">
          {error}
        </p>
      )}
    </div>
  );
}

export function RemoteShopEditor({
  value,
  schema,
  defaults,
  disabled,
  onChange,
}: {
  value: ConfigObject;
  schema: ConfigSchema;
  defaults: ConfigObject;
  disabled: boolean;
  onChange: (value: ConfigObject) => void;
}) {
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [itemKey, setItemKey] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const spawner = childObject(value, "spawner"),
    shop = childObject(spawner, "shop"),
    categories = childObject(shop, "categories");
  const shopSchema =
    schema.properties?.spawner?.properties?.shop ?? emptySchema;
  const categoriesSchema = shopSchema.properties?.categories ?? emptySchema;
  const categoryTemplate = categoriesSchema.additionalProperties || emptySchema;
  const selectedKey =
    categoryKey && categoryKey in categories
      ? categoryKey
      : (Object.keys(categories)[0] ?? null);
  const category = selectedKey ? childObject(categories, selectedKey) : {};
  const categorySchema =
    (selectedKey && categoriesSchema.properties?.[selectedKey]) ||
    categoryTemplate;
  const items = childObject(category, "items");
  const itemsSchema = categorySchema.properties?.items ?? emptySchema;
  const selectedItem = itemKey && itemKey in items ? itemKey : null;
  const defaultShop = childObject(childObject(defaults, "spawner"), "shop");
  const updateShop = (next: ConfigObject) =>
    onChange({ ...value, spawner: { ...spawner, shop: next } });
  const updateCategories = (next: ConfigObject) =>
    updateShop({ ...shop, categories: next });
  const updateCategory = (next: ConfigObject) => {
    if (selectedKey) updateCategories({ ...categories, [selectedKey]: next });
  };
  const updateItems = (next: ConfigObject) =>
    updateCategory({ ...category, items: next });
  const properties = { ...shopSchema.properties };
  delete properties.categories;
  const categoryProperties = { ...categorySchema.properties };
  delete categoryProperties.items;
  const globalValues = { ...shop };
  delete globalValues.categories;
  const categoryValues = { ...category };
  delete categoryValues.items;
  return (
    <div className="remote-editor remote-shop">
      <div className="remote-editor__mode">
        <fieldset aria-label="Modo de edição de shop.yml">
          <button
            type="button"
            aria-pressed={!advanced}
            onClick={() => setAdvanced(false)}
          >
            Inventário visual
          </button>
          <button
            type="button"
            aria-pressed={advanced}
            onClick={() => setAdvanced(true)}
          >
            YAML avançado
          </button>
        </fieldset>
        <span>Moeda suportada: XP</span>
      </div>
      {advanced ? (
        <AdvancedYamlEditor
          value={value}
          schema={schema}
          onChange={onChange}
          disabled={disabled}
          title="shop.yml"
        />
      ) : (
        <>
          <ConfigField
            path="shop.spawner.shop"
            value={globalValues}
            schema={{
              ...shopSchema,
              title: "Funcionamento e aparência da loja",
              properties,
              additionalProperties: false,
            }}
            defaultValue={defaultShop}
            disabled={disabled}
            onChange={(next) => {
              if (isConfigObject(next)) updateShop({ ...next, categories });
            }}
          />
          <section className="remote-panel">
            <header className="remote-section-heading">
              <div>
                <p className="remote-eyebrow">Vitrine do servidor</p>
                <h3>Categorias da loja</h3>
                <p>
                  Organize os spawners, o preço em XP e os elementos visuais
                  usados pelo inventário do jogo.
                </p>
              </div>
            </header>
            <fieldset className="remote-category-grid" aria-label="Categorias">
              {Object.entries(categories).map(([key, entry]) => (
                <button
                  key={key}
                  type="button"
                  className="remote-category"
                  aria-pressed={selectedKey === key}
                  onClick={() => {
                    setCategoryKey(key);
                    setItemKey(null);
                  }}
                >
                  <TbCube aria-hidden="true" size={25} />
                  <strong>{key}</strong>
                  <span>
                    {
                      Object.keys(
                        childObject(
                          isConfigObject(entry) ? entry : {},
                          "items",
                        ),
                      ).length
                    }{" "}
                    spawners
                  </span>
                </button>
              ))}
              {!Object.keys(categories).length && (
                <p className="remote-muted">
                  Nenhuma categoria cadastrada. Adicione a primeira usando o
                  schema desta versão.
                </p>
              )}
            </fieldset>
            {categoriesSchema.additionalProperties && (
              <AddEntry
                label="Adicionar categoria"
                existing={Object.keys(categories)}
                disabled={disabled}
                onAdd={(key) => {
                  updateCategories({
                    ...categories,
                    [key]: nodeDefault(categoryTemplate),
                  });
                  setCategoryKey(key);
                  setItemKey(null);
                }}
              />
            )}
          </section>
          {selectedKey && (
            <section className="remote-panel">
              <header className="remote-section-heading">
                <div>
                  <p className="remote-eyebrow">Categoria selecionada</p>
                  <h3>{selectedKey}</h3>
                </div>
                <button
                  className="remote-button remote-button--danger"
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Remover a categoria ${selectedKey} e os seus itens do rascunho? A alteração só chega ao servidor quando aplicada.`,
                      )
                    )
                      return;
                    const next = { ...categories };
                    delete next[selectedKey];
                    updateCategories(next);
                    setCategoryKey(null);
                    setItemKey(null);
                  }}
                >
                  <TbTrash aria-hidden="true" /> Remover categoria
                </button>
              </header>
              <ConfigField
                path={`shop.spawner.shop.categories.${selectedKey}`}
                schema={{
                  ...categorySchema,
                  properties: categoryProperties,
                  additionalProperties: false,
                }}
                value={categoryValues}
                disabled={disabled}
                onChange={(next) => {
                  if (isConfigObject(next)) updateCategory({ ...next, items });
                }}
              />
              <fieldset
                className="remote-inventory"
                aria-label={`Spawners da categoria ${selectedKey}`}
              >
                {Object.entries(items).map(([key, entry]) => (
                  <button
                    key={key}
                    type="button"
                    className="remote-inventory__slot"
                    aria-pressed={selectedItem === key}
                    data-hidden={isConfigObject(entry) && entry.price === 0}
                    onClick={() => setItemKey(key)}
                  >
                    <TbCube aria-hidden="true" size={28} />
                    <strong>{key.replaceAll("_", " ")}</strong>
                    <span>
                      {isConfigObject(entry) && typeof entry.price === "number"
                        ? `${entry.price.toLocaleString("pt-BR")} XP`
                        : "Conferir preço"}
                    </span>
                    {isConfigObject(entry) && entry.price === 0 && (
                      <small>Oculto na loja</small>
                    )}
                  </button>
                ))}
                {!Object.keys(items).length && (
                  <p className="remote-muted">Esta categoria está vazia.</p>
                )}
              </fieldset>
              {itemsSchema.additionalProperties && (
                <AddEntry
                  label="Adicionar spawner"
                  options={itemsSchema.keyOptions}
                  existing={Object.keys(items)}
                  disabled={disabled}
                  onAdd={(key) => {
                    updateItems({
                      ...items,
                      [key]: nodeDefault(
                        itemsSchema.additionalProperties as ConfigSchema,
                      ),
                    });
                    setItemKey(key);
                  }}
                />
              )}
              {selectedItem && (
                <div className="remote-item-editor">
                  <header className="remote-section-heading">
                    <div>
                      <p className="remote-eyebrow">Item do inventário</p>
                      <h3>{selectedItem}</h3>
                    </div>
                    <button
                      type="button"
                      className="remote-button remote-button--danger"
                      disabled={disabled}
                      onClick={() => {
                        const next = { ...items };
                        delete next[selectedItem];
                        updateItems(next);
                        setItemKey(null);
                      }}
                    >
                      <TbTrash aria-hidden="true" /> Remover item
                    </button>
                  </header>
                  <ConfigField
                    path={`shop.spawner.shop.categories.${selectedKey}.items.${selectedItem}`}
                    value={items[selectedItem]}
                    schema={
                      itemsSchema.properties?.[selectedItem] ??
                      (itemsSchema.additionalProperties || emptySchema)
                    }
                    disabled={disabled}
                    onChange={(next) =>
                      updateItems({ ...items, [selectedItem]: next })
                    }
                  />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
