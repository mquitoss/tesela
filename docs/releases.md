# Versiones y releases de Tesela

Tesela utiliza versionado semántico estable `MAJOR.MINOR.PATCH`. Cada release
crea dos referencias que apuntan al mismo commit:

- rama dedicada `release/vMAJOR.MINOR.PATCH`;
- tag anotado `vMAJOR.MINOR.PATCH`.

La rama facilita inspección y políticas de protección. El tag es la referencia
inmutable recomendada para fijar Tesela como submódulo. Una rama de release no se
modifica después de crear su tag; cualquier corrección genera una nueva versión.

## Ficheros sincronizados

El comando de release mantiene la misma versión en:

- `package.json`;
- `package-lock.json`;
- `pyproject.toml`;
- `app.config.js`;
- `tesela.assets.json`;
- `CHANGELOG.md`.

`npm run version:check` comprueba esta invariancia en local y CI.

## Preparar el changelog

Durante el desarrollo, añade los cambios debajo de:

```markdown
## [Unreleased]
```

La sección debe contener al menos una entrada antes de publicar una versión
nueva; el comando rechaza releases con changelog vacío.

La primera publicación de `0.2.0` acepta también el encabezado bootstrap:

```markdown
## 0.2.0 — sin publicar
```

El comando lo convierte en una entrada fechada y vuelve a crear una sección
`[Unreleased]` vacía para el siguiente ciclo.

## Crear una release

Requisitos:

1. estar en `main`;
2. tener el working tree limpio;
3. haber actualizado `main` respecto a su remoto;
4. no tener ya la rama o el tag de esa versión;
5. disponer de Node, pytest, Ruff y mypy.

Comprueba primero el plan sin modificar Git:

```bash
npm run release -- 0.3.0 --dry-run
```

Crea la release local:

```bash
npm run release -- 0.3.0
```

El comando:

1. crea `release/v0.3.0` desde `main`;
2. sincroniza versiones y fecha el changelog;
3. ejecuta Vitest, npm audit, pytest, Ruff y mypy;
4. crea el commit `release: v0.3.0`;
5. crea el tag anotado `v0.3.0`;
6. vuelve a `main` y hace merge fast-forward de la rama release.

Para publicar `main`, la rama y el tag en un único push:

```bash
npm run release -- 0.3.0 --push
```

Puede elegirse otro remoto:

```bash
npm run release -- 0.3.0 --push --remote upstream
```

El push del tag activa `.github/workflows/release.yml`, vuelve a validar la
versión y crea el GitHub Release.

## Fallos durante una release

Si una validación falla, no se crea commit ni tag. El proceso permanece en la
rama release con los cambios de versión visibles para poder diagnosticar el
problema. Tras corregirlo, elimina la rama fallida y vuelve a ejecutar desde un
`main` limpio, o completa manualmente el proceso después de revisar cada paso.

No uses `--no-verify`, no fuerces tags existentes y no muevas una rama release
publicada.

## Uso como submódulo

Fijación recomendada por tag:

```bash
git submodule add https://github.com/mquitoss/tesela.git vendor/tesela
git -C vendor/tesela checkout v0.3.0
git add .gitmodules vendor/tesela
git commit -m "build: pin Tesela v0.3.0"
```

Seguimiento explícito de la rama dedicada:

```bash
git submodule add -b release/v0.3.0 \
  https://github.com/mquitoss/tesela.git vendor/tesela
```

Incluso al declarar una rama, Git registra un commit concreto del submódulo. El
proyecto host debe revisar y commitear cualquier actualización del puntero.
