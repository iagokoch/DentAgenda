import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test, expect } from '@playwright/test'
import { prepararApi, usuarios, gerarSenha, ok, erro } from './api-sintetica.js'

const require = createRequire(import.meta.url)
const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const instante = new Date('2026-10-05T12:00:00Z')

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: instante })
})

test.afterEach(async ({ page }) => {
  // Fecha a página enquanto as interceptações do contexto ainda estão registradas.
  await page.close()
})

test('servidor QA bloqueia API mesmo fora da interceptação do navegador', async ({ context }) => {
  const resposta = await context.request.get('http://127.0.0.1:4178/api/qa/guarda')
  expect(resposta.status()).toBe(599)
  expect((await resposta.json()).erro.codigo).toBe('API_BLOQUEADA_QA')
})

for (const papel of Object.keys(usuarios)) {
  test(`login ${papel}: navegação e restauração na página permitida`, async ({ page, context }) => {
    let api
    api = await prepararApi(context, { respostas: {
      [`POST /api/auth/${papel === 'paciente' ? 'cliente' : 'funcionario'}/login`]: () => api.sessaoDe(papel),
    } })
    await page.goto('/login')
    await page.getByLabel('CPF ou e-mail', { exact: true }).fill(papel === 'paciente' ? '00000000000' : 'qa@exemplo.invalid')
    await page.getByLabel('Senha', { exact: true }).fill(gerarSenha())
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(papel === 'paciente' ? /\/minha-conta$/ : /\/inicio$/)
    await expect(page.getByText(usuarios[papel].nome, { exact: true }).first()).toBeVisible()
    await page.reload()
    await expect(page.getByText(usuarios[papel].nome, { exact: true }).first()).toBeVisible()
    api.conferir()
  })
}

for (const papel of ['recepcao', 'dentista', 'paciente']) {
  test(`${papel} não abre administração por URL direta`, async ({ page, context }) => {
    const api = await prepararApi(context, { usuario: usuarios[papel] })
    await page.goto('/admin/equipe')
    await expect(page).toHaveURL(papel === 'paciente' ? /\/minha-conta$/ : /\/inicio$/)
    expect(api.pedidos).not.toContain('GET /api/funcionarios')
    api.conferir()
  })
}

test('anônimo é redirecionado antes de carregar dados de paciente', async ({ page, context }) => {
  const api = await prepararApi(context)
  await page.goto('/pacientes/qa-nao-existe')
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  expect(api.pedidos).toEqual(['POST /api/auth/refresh'])
  api.conferir()
})

test('cadastro passa por código, preserva dados e entra na área do paciente', async ({ page, context }) => {
  let api
  api = await prepararApi(context, { respostas: {
    'POST /api/auth/cliente/cadastro/codigo': ok({ mensagem: 'Código sintético preparado.' }),
    'POST /api/auth/cliente/cadastro/confirmar': () => api.sessaoDe('paciente'),
  } })
  await page.goto('/cadastro')
  await page.getByLabel('CPF', { exact: true }).fill('00000000000')
  await page.getByLabel('Celular com DDD').fill('00000000000')
  await page.getByRole('button', { name: 'Enviar código por SMS' }).click()
  await expect(page.getByLabel('CPF', { exact: true })).toHaveAttribute('readonly', '')
  await page.getByLabel('Código recebido por SMS').fill('000000')
  await page.getByLabel('Nome completo').fill('Paciente QA')
  await page.getByLabel('Senha', { exact: true }).fill(gerarSenha())
  await page.getByRole('button', { name: 'Cadastrar', exact: true }).click()
  await expect(page).toHaveURL(/\/minha-conta$/)
  api.conferir()
})

test('recuperação permite corrigir código expirado sem perder a etapa', async ({ page, context }) => {
  let tentativas = 0
  const api = await prepararApi(context, { respostas: {
    'POST /api/auth/funcionario/recuperacao/codigo': ok({ mensagem: 'Código sintético preparado.' }),
    'POST /api/auth/funcionario/recuperacao/confirmar': () => ++tentativas === 1 ? erro('CODIGO_INVALIDO', 400) : ok(null, 204),
  } })
  await page.goto('/recuperar-senha')
  await page.getByLabel('CPF ou e-mail cadastrado').fill('qa@exemplo.invalid')
  await page.getByRole('button', { name: 'Enviar código', exact: true }).click()
  for (let indice = 1; indice <= 6; indice++) await page.getByLabel(`Dígito ${indice}`, { exact: true }).fill('0')
  const senha = gerarSenha()
  await page.getByLabel('Nova senha', { exact: true }).fill(senha)
  await page.getByLabel('Confirmar nova senha').fill(senha)
  await page.getByRole('button', { name: 'Redefinir Senha' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Reenviar código' }).click()
  await page.getByRole('button', { name: 'Redefinir Senha' }).click()
  await expect(page.getByRole('heading', { name: 'Senha redefinida!' })).toBeVisible()
  api.conferir()
})

test('login 400px: teclado, ausência de overflow e axe com CSS real', async ({ page, context }) => {
  const api = await prepararApi(context)
  await page.setViewportSize({ width: 400, height: 850 })
  await page.goto('/login')
  const identificador = page.getByLabel('CPF ou e-mail', { exact: true })
  await identificador.focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Senha', { exact: true })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe })
  const violacoes = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(({ id, impact }) => ({ id, impact })))
  expect(violacoes).toEqual([])
  api.conferir()
})

test('agendamento do paciente recupera conflito e confirma novo horário', async ({ page, context }) => {
  let reservas = 0
  const api = await prepararApi(context, { usuario: usuarios.paciente, respostas: {
    'GET /api/procedimentos': ok([{ id: 'qa-proc', nome: 'Procedimento QA', duracaoMinutos: 60, precoCentavos: 18000, ativo: true }]),
    'GET /api/dentistas': ok([{ id: 'qa-dentista', nome: 'Dentista QA' }]),
    'GET /api/dias-disponiveis': ok({ dias: ['2026-10-06'] }),
    'GET /api/horarios-livres': ok({ horarios: [{ dentistaId: 'qa-dentista', inicio: '2026-10-06T09:00:00-03:00' }] }),
    'POST /api/consultas': (request) => {
      expect(request.postDataJSON()).not.toHaveProperty('pacienteId')
      return ++reservas === 1 ? erro('FORA_DO_PASSO', 409) : ok({ id: 'qa-consulta', paciente: { nome: 'Paciente QA' }, dentista: { nome: 'Dentista QA' }, procedimento: { nome: 'Procedimento QA' }, inicio: '2026-10-06T09:00:00-03:00', fim: '2026-10-06T10:00:00-03:00', status: 'CONFIRMADA' }, 201)
    },
  } })
  await page.goto('/minha-conta/agendar')
  await page.getByLabel('Procedimento', { exact: true }).selectOption('qa-proc')
  await page.getByRole('button', { name: '6 de outubro de 2026', exact: true }).click()
  await page.getByRole('button', { name: '09:00', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByText('Esse horário não é um dos oferecidos. Escolha outro horário.')).toBeVisible()
  await page.getByRole('button', { name: '09:00', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Consulta marcada/ })).toBeVisible()
  expect(reservas).toBe(2)
  api.conferir()
})

test('cancelamento a menos de 24h exige justificativa e prende foco no diálogo', async ({ page, context }) => {
  let cancelada = false
  const consulta = { id: 'qa-consulta', paciente: { nome: 'Paciente QA' }, dentista: { nome: 'Dentista QA' }, procedimento: { nome: 'Procedimento QA' }, inicio: '2026-10-05T14:00:00-03:00', fim: '2026-10-05T15:00:00-03:00', status: 'CONFIRMADA' }
  const api = await prepararApi(context, { usuario: usuarios.paciente, respostas: {
    'GET /api/consultas': () => ok({ itens: cancelada ? [] : [consulta], total: cancelada ? 0 : 1, pagina: 1, porPagina: 100 }),
    'POST /api/consultas/qa-consulta/cancelamento': (request) => {
      expect(request.postDataJSON()).toEqual({ justificativa: 'Motivo sintético de QA' })
      cancelada = true
      return ok({ ...consulta, status: 'CANCELADA' })
    },
  } })
  await page.goto('/minha-conta')
  const abrir = page.getByRole('button', { name: /^Cancelar consulta de/ })
  await abrir.click()
  const dialogo = page.getByRole('dialog')
  const justificativa = dialogo.getByLabel('Justificativa', { exact: true })
  await expect(justificativa).toBeFocused()
  await expect(justificativa).toHaveAttribute('required', '')
  await page.keyboard.press('Shift+Tab')
  await expect(dialogo.getByRole('button', { name: 'Cancelar consulta', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(justificativa).toBeFocused()
  await justificativa.fill('Motivo sintético de QA')
  await dialogo.getByRole('button', { name: 'Cancelar consulta', exact: true }).click()
  await expect(dialogo).not.toBeVisible()
  await expect(page.getByText('Consulta cancelada.', { exact: true })).toBeVisible()
  api.conferir()
})

test('admin navega entre equipe e procedimentos, mantendo histórico do navegador', async ({ page, context }) => {
  const api = await prepararApi(context, { usuario: usuarios.admin })
  await page.goto('/admin/equipe')
  await expect(page.getByRole('heading', { name: 'Equipe', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Procedimentos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Procedimentos', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Equipe', exact: true })).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Procedimentos', exact: true })).toBeVisible()
  api.conferir()
})

test('busca de pacientes recupera falha HTTP sem perder formulário', async ({ page, context }) => {
  const api = await prepararApi(context, { usuario: usuarios.recepcao, respostas: {
    'GET /api/pacientes': (request) => new URL(request.url()).searchParams.get('busca') === 'QA'
      ? ok({ itens: [], total: 0, pagina: 1, porPagina: 20 }) : erro('ERRO_INTERNO', 500),
  } })
  await page.goto('/pacientes')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Buscar paciente', { exact: true }).fill('QA')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page).toHaveURL(/busca=QA/)
  await expect(page.getByRole('alert')).not.toBeVisible()
  await expect(page.getByLabel('Buscar paciente', { exact: true })).toHaveValue('QA')
  api.conferir()
})
