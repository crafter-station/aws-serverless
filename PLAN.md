# aws.crafter.run

Catálogo en español de **AWS Serverless** y **System Design con AWS**, al estilo de
[refactoring.guru](https://refactoring.guru/design-patterns): imágenes, diagramas,
explicaciones sencillas y lo esencial de cada tema.

Archivo de aprendizaje personal, publicado.

---

## Las dos mitades

| | **Servicio** | **Patrón** |
|---|---|---|
| Qué es | Vocabulario | Gramática |
| Papel | Puerta de entrada | Destino |
| Contenido | Referencia: límites, precios, cuotas | Criterio: cuándo sí, cuándo no |
| Longitud | Corta (8 campos) | Larga (14 campos) |

El puente entre ambas es el bloque **"dónde aparece esto"**: cada servicio enlaza
a los patrones que lo usan.

---

## Catálogo v1

**6 servicios** — Lambda · API Gateway · DynamoDB · SQS · SNS · EventBridge

**8 patrones** — fan-out · idempotencia en consumidores · DLQ y redrive ·
single-table design · cold start · outbox con DynamoDB Streams ·
saga orquestada con Step Functions · presigned URLs

Catálogo completo objetivo: ~14 servicios y ~34 patrones en 6 familias
(comunicación, fiabilidad, datos, escala, frontera, operación).

---

## Anatomía de una ficha

### Patrón (14 campos)

```
1.  titulo + alias en inglés     lo vas a googlear en inglés
2.  intencion                    2 frases, sin jerga
3.  problema                     historia concreta + diagrama del "antes roto"
4.  solucion                     la idea + DIAGRAMA PRINCIPAL
5.  cuando usarlo
6.  cuando NO usarlo             OBLIGATORIO
7.  implementacion               pasos numerados, agnósticos
8.  codigo                       snippet mínimo, TypeScript
9.  trampas                      OBLIGATORIO — "lo que te va a morder"
10. coste                        orden de magnitud
11. servicios[]                  refs a fichas de servicio
12. relacionados[]               OBLIGATORIO — con la relación nombrada:
                                 "compite con" / "se combina con" / "requiere"
13. lab?                         opcional, nunca bloquea publicar
14. familia + dificultad(1-3)
```

### Servicio (8 campos)

```
1. en_una_frase
2. modelo_mental        la analogía + un diagrama simple
3. los_3_conceptos      lo que si no entiendes, nada encaja
4. limites              TABLA, marcando HARD (no se suben) vs SOFT (ticket)
5. coste                cómo te facturan de verdad + la trampa de facturación
6. cuando NO usarlo
7. errores_comunes
8. patrones[]           "dónde aparece esto"
```

Los campos 4 y 5 del servicio son la razón de ser del sitio: AWS tiene esa
información desperdigada en veinte páginas y decide arquitecturas enteras.

---

## Decisiones y sus porqués

| Decisión | Por qué |
|---|---|
| **Español**, términos técnicos en inglés | Hueco de mercado real; *fan-out* e *idempotency* no se traducen |
| **Astro** | Content collections + Zod validan el contenido **en build**: la consistencia entre la ficha 3 y la 27 pasa a ser un error de compilación, no fuerza de voluntad |
| **Iconos oficiales de AWS, intactos** | Fidelidad máxima. Además, AWS **prohíbe modificarlos**: redibujarlos "fielmente" sería una infracción. Vía: `@aws-icons/astro` (inline en build, cero JS) |
| **SVG a mano solo para el tejido conectivo** | Flechas, colas, límites de cuenta, anotaciones. Un set corto de primitivas hace que cada diagrama cueste minutos, no horas |
| **Claro y cálido, sin modo oscuro en v1** | Los iconos oficiales son cuadrados a todo color para fondo blanco: fondo oscuro es una pelea perdida |
| **Contenido híbrido** | Campos cortos en frontmatter (Zod los valida) + prosa en MDX + check de encabezados obligatorios |
| **Sitio en VPS Dokploy**, no en AWS | El cuello de botella es producir fichas, no desplegar HTML. El aprendizaje de AWS ocurre en los laboratorios |
| **`lab` opcional y perezoso** | Si el laboratorio fuese requisito para publicar, se publican tres fichas y se abandona |
| **Fan-out primero, entera y fea** | Diseñar 14 campos en abstracto garantiza inventar tres que sobran y omitir dos que hacen falta. El esquema se extrae de la ficha |
| **Desplegar desde la ficha 1** | Arreglar el despliegue con 1 ficha cuesta minutos; con 14, una tarde |

---

## Invariantes

- **`verificado_en`** visible en cada ficha. Los límites y precios de AWS caducan;
  sin fecha, el sitio miente en silencio dentro de un año.
- **Fuentes primarias.** Límites, cuotas y precios se verifican contra
  documentación oficial de AWS, no contra blogs.
- **Relaciones bidireccionales.** Si A dice que se combina con B, B menciona a A.
  El build detecta las huérfanas.
- **Los iconos de AWS no se tocan.** Nunca. Ni el color, ni la forma, ni el recorte.
- **Cada laboratorio incluye `cdk destroy`** y su coste estimado en reposo.

---

## Estado

- [x] 1. Scaffold Astro + MDX + `@aws-icons/astro`
- [x] 2. Ficha **fan-out** completa: prosa, 2 diagramas, 6 primitivas visuales
- [x] 3. Extraer el sistema: esquemas Zod, plantillas, checks de build
- [x] 4. Desplegar en [`aws.crafter.run`](https://aws.crafter.run)
- [x] 5a. Servicios de v1 completos: 6 de 6
- [ ] 5b. Patrones: 3 de 8 de v1 (quedan single-table, cold start, outbox, saga orquestada, presigned URLs)
- [x] 6. Umbral de mostrar alcanzado: 4 servicios + 3 patrones

### Lo que el sistema resultó ser

Escribir dos fichas antes de diseñar el esquema cambió tres cosas respecto a
lo planeado:

- **`estado: esbozo | listo`.** Una ficha nace como esbozo (título, familia,
  una frase) y ya aparece en el catálogo y puede ser destino de un enlace.
  Sin esto, enlazar un patrón obligaría a escribirlo primero, y el catálogo
  habría que escribirlo entero de golpe.
- **Las relaciones y los servicios se declaran en frontmatter, no en prosa.**
  La sección "Patrones relacionados" y el "dónde aparece esto" de cada
  servicio se **renderizan**, no se escriben. `reference()` valida en build
  que el destino exista, y la reversa no puede desactualizarse.
- **La tabla de límites vive alta en la ficha**, no al final: es la razón por
  la que alguien abre una ficha de servicio.

Los checks de `src/lib/coherencia.ts` se probaron en negativo (rompiendo una
ficha a propósito) antes de darlos por buenos. Un check que nunca dispara es
peor que ningún check.

### Despliegue

Compose en Dokploy (`crafter-station/aws-serverless` → `docker-compose.yaml` →
Dockerfile multi-etapa: Node compila, nginx sirve). Se usa la ruta de **compose**
y no la de app porque el endpoint `application.saveBuildType` de este Dokploy
rechaza `buildType: dockerfile` con un error de validación sobre `herokuVersion`.

---

## Créditos

AWS Architecture Icons son © Amazon Web Services, Inc., usados sin modificación
bajo los [términos de AWS](https://aws.amazon.com/architecture/icons/).
