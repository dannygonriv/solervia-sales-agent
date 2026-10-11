import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
test("flujo completo privado: login, CRM, campaña, transcripción, correo, reunión y persistencia", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/prospectos");
  await expect(page).toHaveURL(/login/);
  await page
    .getByLabel("Correo del administrador")
    .fill("test@example.invalid");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Test-only-password-2026");
  await page.getByRole("button", { name: "Entrar al workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Una buena conversación empieza aquí." }),
  ).toBeVisible();
  mkdirSync("docs/screenshots", { recursive: true });
  await page.screenshot({
    path: "docs/screenshots/dashboard-empty.png",
    fullPage: true,
  });
  // Capture authenticated state for API-assisted prerequisites; business actions below use visible UI.
  const stateResponse = await page.request.get("/api/state");
  expect(stateResponse.ok()).toBeTruthy();
  const initial = await stateResponse.json();
  const post = async (path: string, data: unknown, method = "POST") => {
    const response = await page.request.fetch("/api/" + path, {
      method,
      headers: { Origin: "http://127.0.0.1:3100" },
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  await post(
    "settings",
    { ...initial.settings, start_hour: 0, end_hour: 24 },
    "PATCH",
  );
  await page.getByRole("link", { name: "Configuración", exact: true }).click();
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page.getByRole("button", { name: "Agregar producto" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Solervia Custom");
  await page
    .getByLabel("Descripción y funciones verificadas")
    .fill("Desarrollo de sistemas internos y automatizaciones para PyMEs.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Solervia Custom", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guiones", exact: true }).click();
  await page.getByRole("button", { name: "Crear guion", exact: true }).click();
  await page
    .getByLabel("Producto", { exact: true })
    .selectOption({ label: "Solervia Custom" });
  await page.getByLabel("Nombre del guion").fill("Conversación exploratoria");
  await page.getByLabel("Público objetivo").fill("Pequeñas empresas");
  await page
    .getByLabel("Propuesta de valor")
    .fill("Explorar procesos que podrían beneficiarse de software.");
  await page
    .getByLabel("Preguntas de calificación")
    .fill("¿Qué proceso les consume más tiempo?");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conversación exploratoria" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Buscar empresas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Buscar empresas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 empresas encontradas" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Registrado", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /^Prospectos/ })
    .first()
    .click();
  await page.getByRole("link", { name: /Taller Horizonte/ }).click();
  await page.getByRole("button", { name: "Calificar prospecto" }).click();
  await expect(
    page.getByRole("heading", { name: "Hipótesis · por validar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar seguimiento" }).click();
  await page
    .getByLabel("Estado", { exact: true })
    .selectOption("Aprobado para contacto");
  await page
    .getByLabel("Notas", { exact: true })
    .fill("Nota persistida desde el navegador.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByText("Nota persistida desde el navegador."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Nota persistida desde el navegador."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preparar correo", exact: true })
    .click();
  await page
    .getByLabel("Producto", { exact: true })
    .selectOption({ label: "Solervia Custom" });
  await page.getByRole("button", { name: "Generar borrador" }).click();
  await expect(page.getByText("Borrador disponible en Correos.")).toBeVisible();
  await page.getByRole("link", { name: "Correos", exact: true }).click();
  await page.getByRole("button", { name: "Aprobar contenido" }).click();
  await page.getByRole("button", { name: "Encolar simulación" }).click();
  await page.getByRole("link", { name: "Campañas", exact: true }).click();
  await page
    .getByRole("button", { name: "Crear campaña", exact: true })
    .click();
  await page.getByLabel("Nombre de la campaña").fill("Llamada demo E2E");
  await page
    .getByLabel("Producto", { exact: true })
    .selectOption({ label: "Solervia Custom" });
  await page.getByLabel("Canal", { exact: true }).selectOption("call");
  await page
    .getByLabel("Guion (obligatorio para llamadas)")
    .selectOption({ label: "Conversación exploratoria" });
  await page.getByLabel(/Taller Horizonte/).check();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Llamada demo E2E" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revisar e iniciar" }).click();
  await page
    .getByRole("button", { name: "Iniciar simulación", exact: true })
    .click();
  await page.getByRole("link", { name: "Actividad", exact: true }).click();
  await page
    .getByRole("button", { name: "Ejecutar trabajos pendientes" })
    .click();
  await expect(page.getByText("Ciclo de trabajos ejecutado.")).toBeVisible();
  await page.getByRole("link", { name: "Llamadas", exact: true }).click();
  await page.locator("summary").first().click();
  await expect(
    page.getByText("[SIMULACIÓN — no hubo llamada]", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Probar evento de análisis" }).click();
  await expect(
    page.getByText("Webhook simulado procesado de forma idempotente."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Correos", exact: true }).click();
  await expect(page.getByText("Demo · Envío simulado")).toBeVisible();
  await page.getByRole("link", { name: "Calendario", exact: true }).click();
  await page.getByRole("button", { name: "Proponer reunión" }).click();
  await page
    .getByLabel("Empresa", { exact: true })
    .selectOption({ label: "Taller Horizonte · DEMO" });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("button", { name: "Simular confirmación" }).click();
  await expect(
    page.getByText("Confirmación simulada", { exact: true }),
  ).toBeVisible();
  for (const name of [
    "Dashboard",
    "Prospectos",
    "Buscar empresas",
    "Campañas",
    "Llamadas",
    "Correos",
    "Calendario",
    "Actividad",
    "Estadísticas",
    "Configuración",
  ]) {
    await page
      .getByRole("link", { name: new RegExp("^" + name + "(?:\\s*\\d+)?$") })
      .first()
      .click();
    await expect(page.locator("h1")).toBeVisible();
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Una buena conversación empieza aquí." }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard-demo.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/dashboard-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await expect(
    page.getByRole("link", { name: "Configuración", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
