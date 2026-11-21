
"use strict";

// ==========================================
// ORÇAFÁCIL - APLICAÇÃO PRINCIPAL
// Versão com armazenamento Supabase por utilizador
// ==========================================

(() => {
    const supabaseDados = window.orcafacilSupabase;

    const form = document.getElementById("formOrcamento");
    const linhas = document.getElementById("linhas");
    const mensagem = document.getElementById("mensagem");

    const CHAVE_PROFISSIONAL = "orcafacil_profissional";
    const CHAVE_RASCUNHO = "orcafacil_rascunho";
    const CHAVE_HISTORICO = "orcafacil_historico";
    const CHAVE_CONTADOR = "orcafacil_contador";
    const CHAVE_CLIENTES = "orcafacil_clientes";

    const CHAVES_BACKUP = [
        CHAVE_PROFISSIONAL,
        CHAVE_RASCUNHO,
        CHAVE_HISTORICO,
        CHAVE_CONTADOR,
        CHAVE_CLIENTES
    ];

    let utilizadorNuvemId = null;
    let dadosNuvemCarregados = false;
    let eventosInstalados = false;
    let aRestaurarDados = false;
    let orcamentoAtualId = null;
    let temporizadorPerfil = null;
    let temporizadorRascunho = null;

    let cadeiaGravacaoPerfil = Promise.resolve();
    let cadeiaGravacaoRascunho = Promise.resolve();

    // ==========================================
    // FUNÇÕES AUXILIARES
    // ==========================================

    function campo(id) {
        return document.getElementById(id);
    }

    function euros(valor) {
        return Number(valor || 0).toLocaleString("pt-PT", {
            style: "currency",
            currency: "EUR"
        });
    }

    function mostrarMensagem(texto) {
        if (mensagem) mensagem.textContent = texto;
    }

    function exigirNuvem() {
        if (
            !supabaseDados ||
            !utilizadorNuvemId ||
            !dadosNuvemCarregados
        ) {
            throw new Error(
                "A conta ainda não está ligada ao armazenamento na nuvem."
            );
        }
    }

    function lerJSONLocal(chave, valorPadrao) {
        try {
            const valor = localStorage.getItem(chave);
            return valor ? JSON.parse(valor) : valorPadrao;
        } catch (erro) {
            console.error(
                "Não foi possível ler os dados locais:",
                chave,
                erro
            );
            return valorPadrao;
        }
    }

    function guardarJSONLocal(chave, valor) {
        try {
            localStorage.setItem(chave, JSON.stringify(valor));
            return true;
        } catch (erro) {
            console.error(
                "Não foi possível atualizar a cópia local:",
                chave,
                erro
            );
            mostrarMensagem(
                "Não foi possível atualizar a cópia local do navegador."
            );
            return false;
        }
    }

    // ==========================================
    // CARREGAR DADOS DA CONTA NO SUPABASE
    // ==========================================

    async function carregarDadosDaNuvem() {
        if (!supabaseDados) {
            throw new Error(
                "A ligação ao Supabase não está disponível."
            );
        }

        const { data: autenticacao, error: erroAuth } =
            await supabaseDados.auth.getUser();

        if (erroAuth || !autenticacao.user) {
            throw new Error(
                "Não foi possível identificar a conta autenticada."
            );
        }

        utilizadorNuvemId = autenticacao.user.id;

        const [perfil, rascunho, historico, contadores, clientes] =
            await Promise.all([

                supabaseDados
                    .from("orcafacil_perfis")
                    .select("dados")
                    .eq("user_id", utilizadorNuvemId)
                    .maybeSingle(),

                supabaseDados
                    .from("orcafacil_rascunhos")
                    .select("dados")
                    .eq("user_id", utilizadorNuvemId)
                    .maybeSingle(),

                supabaseDados
                    .from("orcafacil_orcamentos")
                    .select("id,numero,dados")
                    .eq("user_id", utilizadorNuvemId),

                supabaseDados
                    .from("orcafacil_contadores")
                    .select("ano,ultimo_numero")
                    .eq("user_id", utilizadorNuvemId),

                supabaseDados
                    .from("orcafacil_clientes")
                    .select("id,nome,nif,telefone,email,morada")
                    .eq("user_id", utilizadorNuvemId)
                    .order("nome")
            ]);

        const resultados = [
            perfil,
            rascunho,
            historico,
            contadores,
            clientes
        ];

        const falha = resultados.find(
            resultado => resultado.error
        );

        if (falha) {
            throw new Error(
                "Não foi possível carregar os dados da nuvem: " +
                falha.error.message
            );
        }


        // PERFIL
        if (perfil.data && perfil.data.dados) {
            guardarJSONLocal(
                CHAVE_PROFISSIONAL,
                perfil.data.dados
            );
        } else {
            localStorage.removeItem(CHAVE_PROFISSIONAL);
        }

        // RASCUNHO
        if (rascunho.data && rascunho.data.dados) {
            guardarJSONLocal(
                CHAVE_RASCUNHO,
                rascunho.data.dados
            );
        } else {
            localStorage.removeItem(CHAVE_RASCUNHO);
        }

        // HISTÓRICO
        const listaHistorico = (historico.data || []).map(registo => {

            const dados = registo.dados || {};

            return {
                ...dados,
                id: registo.id,
                numero: registo.numero || dados.numero,
                atualizadoEm: dados.atualizadoEm || null
            };
        });

        guardarJSONLocal(
            CHAVE_HISTORICO,
            listaHistorico
        );

        // CONTADORES

        const mapaContadores = {};

        (contadores.data || []).forEach(registo => {
            mapaContadores[registo.ano] =
                registo.ultimo_numero;
        });

        guardarJSONLocal(
            CHAVE_CONTADOR,
            mapaContadores
        );
        // CLIENTES
        guardarJSONLocal(
            CHAVE_CLIENTES,
            clientes.data || []
        );
        dadosNuvemCarregados = true;

        console.log(
            "Dados da conta carregados do Supabase."
        );

    }

    // ==========================================
    // LOGÓTIPO
    // ==========================================

    function obterLogotipo() {
        return new Promise((resolve, reject) => {

            const input = campo("logotipo");

            const ficheiro = input && input.files
                ? input.files[0]
                : null;

            if (!ficheiro) {
                const dados = lerJSONLocal(
                    CHAVE_PROFISSIONAL,
                    {}
                );

                resolve(dados.logotipo || null);
                return;
            }

            if (
                !["image/png", "image/jpeg"].includes(
                    ficheiro.type
                )
            ) {
                reject(
                    new Error(
                        "Seleciona uma imagem PNG ou JPG."
                    )
                );
                return;
            }

            if (ficheiro.size > 3 * 1024 * 1024) {
                reject(
                    new Error(
                        "O logótipo não pode ultrapassar 3 MB."
                    )
                );
                return;
            }

            const leitor = new FileReader();

            leitor.onload = async () => {
                try {
                    const dados = lerJSONLocal(
                        CHAVE_PROFISSIONAL,
                        {}
                    );

                    dados.logotipo = leitor.result;

                    guardarJSONLocal(
                        CHAVE_PROFISSIONAL,
                        dados
                    );

                    await guardarDadosProfissionalNaNuvem(
                        dados
                    );

                    resolve(leitor.result);

                } catch (erro) {
                    reject(
                        new Error(
                            "Não foi possível guardar o logótipo: " +
                            erro.message
                        )
                    );
                }
            };

            leitor.onerror = () => {
                reject(
                    new Error(
                        "Não foi possível ler o logótipo."
                    )
                );
            };

            leitor.readAsDataURL(ficheiro);
        });
    }

    // ==========================================
    // DATAS E TRABALHOS
    // ==========================================

    function iniciarDatas() {
        const hoje = new Date();

        function formatarData(data) {
            const local = new Date(
                data.getTime() -
                data.getTimezoneOffset() * 60000
            );

            return local.toISOString().slice(0, 10);
        }

        campo("data").value = formatarData(hoje);

        const validade = new Date(hoje);
        validade.setDate(validade.getDate() + 30);

        campo("validade").value = formatarData(validade);
    }

    function obterLinhas() {

        return [
            ...linhas.querySelectorAll(".linha-trabalho")
        ].map(linha => {

            const descricao =
                linha.querySelector(".desc").value.trim();

            const quantidade = Number(
                linha.querySelector(".qtd").value
            );

            const preco = Number(
                linha.querySelector(".preco-unit").value
            );

            const taxa = Number(
                linha.querySelector(".taxa").value
            );

            const base = quantidade * preco;

            return {
                descricao,
                quantidade,
                preco,
                taxa,
                base,
                iva: base * taxa / 100
            };
        });
    }

    function calcular() {
        const items = obterLinhas();

        const subtotal = items.reduce(
            (soma, item) => soma + item.base,
            0
        );

        const totalIva = items.reduce(
            (soma, item) => soma + item.iva,
            0
        );

        campo("subtotal").textContent = euros(subtotal);
        campo("totalIva").textContent = euros(totalIva);
        campo("total").textContent =
            euros(subtotal + totalIva);
    }

    function validarLinhas() {
        const items = obterLinhas();

        if (items.length === 0) {
            mostrarMensagem(
                "Adiciona pelo menos um trabalho."
            );
            return false;
        }

        for (const item of items) {

            if (!item.descricao) {
                mostrarMensagem(
                    "Preenche a descrição de todos os trabalhos."
                );
                return false;
            }

            if (
                !Number.isFinite(item.quantidade) ||
                item.quantidade <= 0
            ) {
                mostrarMensagem(
                    "Verifica as quantidades."
                );
                return false;
            }

            if (
                !Number.isFinite(item.preco) ||
                item.preco < 0
            ) {
                mostrarMensagem(
                    "Verifica os preços."
                );
                return false;
            }
        }

        return true;
    }

    // ==========================================
    // ADICIONAR LINHA
    // ==========================================

    function adicionarLinha(
        descricao = "",
        quantidade = 1,
        preco = 0,
        taxa = 23
    ) {

        const linha = document.createElement("div");
        linha.className = "linha-trabalho";

        const descLabel = document.createElement("label");
        descLabel.className = "descricao";
        descLabel.append("Descrição");

        const desc = document.createElement("input");
        desc.className = "desc";
        desc.type = "text";
        desc.required = true;
        desc.placeholder = "Ex.: Instalação de tomadas";
        desc.value = descricao;

        descLabel.append(desc);

        const qtdLabel = document.createElement("label");
        qtdLabel.append("Quantidade");

        const qtd = document.createElement("input");
        qtd.className = "qtd";
        qtd.type = "number";
        qtd.min = "0.01";
        qtd.step = "0.01";
        qtd.required = true;
        qtd.value = quantidade;

        qtdLabel.append(qtd);

        const precoLabel = document.createElement("label");
        precoLabel.append("Preço unit. (€)");

        const precoInput = document.createElement("input");
        precoInput.className = "preco-unit";
        precoInput.type = "number";
        precoInput.min = "0";
        precoInput.step = "0.01";
        precoInput.required = true;
        precoInput.value = preco;

        precoLabel.append(precoInput);

        const ivaLabel = document.createElement("label");
        ivaLabel.append("IVA");

        const select = document.createElement("select");
        select.className = "taxa";

        for (const percentagem of [23, 13, 6, 0]) {
            const option = document.createElement("option");

            option.value = percentagem;
            option.textContent = percentagem + "%";
            option.selected =
                percentagem === Number(taxa);

            select.append(option);
        }

        ivaLabel.append(select);

        const remover = document.createElement("button");
        remover.type = "button";
        remover.className = "remover";
        remover.textContent = "×";
        remover.setAttribute(
            "aria-label",
            "Remover linha"
        );

        linha.append(
            descLabel,
            qtdLabel,
            precoLabel,
            ivaLabel,
            remover
        );

        linhas.append(linha);

        calcular();
    }

    // ==========================================
    // DADOS PROFISSIONAIS E RASCUNHO
    // ==========================================

    function dadosProfissional() {
        const anterior = lerJSONLocal(
            CHAVE_PROFISSIONAL,
            {}
        );

        return {
            empresa: campo("empresa").value,
            nifEmpresa: campo("nifEmpresa").value,
            contacto: campo("contacto").value,
            moradaEmpresa: campo("moradaEmpresa").value,
            logotipo: anterior.logotipo || null
        };
    }

    function dadosOrcamento() {
        return {
            empresa: campo("empresa").value.trim(),
            nif: campo("nifEmpresa").value.trim(),
            contacto: campo("contacto").value.trim(),
            moradaEmpresa: campo("moradaEmpresa").value.trim(),
            clienteId: campo("clienteSelecionado")?.value || null,
            cliente: campo("cliente").value.trim(),
            moradaObra: campo("moradaObra").value.trim(),
            numero: campo("numero").value.trim(),
            data: campo("data").value,
            validade: campo("validade").value,
            notas: campo("notas").value.trim(),
            estado: campo("estadoOrcamento")?.value || "Pendente",
            items: obterLinhas()
        };
    }

    // ==========================================
    // GUARDAR PERFIL NO SUPABASE
    // ==========================================

    async function guardarDadosProfissionalNaNuvem(
        dados = dadosProfissional()
    ) {
        exigirNuvem();

        const { error } = await supabaseDados
            .from("orcafacil_perfis")
            .upsert({
                user_id: utilizadorNuvemId,
                dados
            });

        if (error) {
            throw new Error(
                "Erro ao guardar os dados profissionais: " +
                error.message
            );
        }

        return true;
    }

    function guardarDadosProfissional() {
        if (aRestaurarDados) return;

        const dados = dadosProfissional();

        guardarJSONLocal(
            CHAVE_PROFISSIONAL,
            dados
        );

        if (!dadosNuvemCarregados) return;

        clearTimeout(temporizadorPerfil);

        temporizadorPerfil = setTimeout(() => {

            cadeiaGravacaoPerfil =
                cadeiaGravacaoPerfil
                    .then(() =>
                        guardarDadosProfissionalNaNuvem(dados)
                    )
                    .catch(erro => {
                        console.error(erro);
                        mostrarMensagem(erro.message);
                    });

        }, 600);
    }

    // ==========================================
    // GUARDAR RASCUNHO NO SUPABASE
    // ==========================================

    async function guardarRascunhoNaNuvem(
        rascunho = obterRascunhoAtual()
    ) {
        exigirNuvem();
        const { data: sessao } = await supabaseDados.auth.getUser();


        const { error } = await supabaseDados
            .from("orcafacil_rascunhos")
            .upsert({
                user_id: utilizadorNuvemId,
                dados: rascunho
            });

        if (error) {
            throw new Error(
                "Erro ao guardar o rascunho: " +
                error.message
            );
        }

        return true;
    }

    function obterRascunhoAtual() {
        return {
            ...dadosOrcamento(),
            id: orcamentoAtualId
        };
    }

    function guardarRascunho() {
        if (aRestaurarDados) return;

        const rascunho = obterRascunhoAtual();

        guardarJSONLocal(
            CHAVE_RASCUNHO,
            rascunho
        );

        if (!dadosNuvemCarregados) return;

        clearTimeout(temporizadorRascunho);

        temporizadorRascunho = setTimeout(() => {

            cadeiaGravacaoRascunho =
                cadeiaGravacaoRascunho
                    .then(() =>
                        guardarRascunhoNaNuvem(rascunho)
                    )
                    .catch(erro => {
                        console.error(erro);
                        mostrarMensagem(erro.message);
                    });

        }, 700);
    }

    async function sincronizarGravacoesPendentes() {

        clearTimeout(temporizadorPerfil);
        clearTimeout(temporizadorRascunho);

        if (!dadosNuvemCarregados) {
            return;
        }

        // Preparar a gravação final do perfil,
        // respeitando as gravações anteriores.
        const gravarPerfil = cadeiaGravacaoPerfil.then(
            () => guardarDadosProfissionalNaNuvem()
        );

        cadeiaGravacaoPerfil = gravarPerfil.catch(erro => {
            console.error("Erro ao sincronizar perfil:", erro);
            mostrarMensagem(erro.message);
        });

        // Preparar a gravação final do rascunho,
        // respeitando as gravações anteriores.
        const gravarRascunho = cadeiaGravacaoRascunho.then(
            () => guardarRascunhoNaNuvem()
        );

        cadeiaGravacaoRascunho = gravarRascunho.catch(erro => {
            console.error("Erro ao sincronizar rascunho:", erro);
            mostrarMensagem(erro.message);
        });

        // Esperar pelas duas gravações finais.
        await Promise.all([
            gravarPerfil,
            gravarRascunho
        ]);

        console.log(
            "Perfil e rascunho sincronizados com sucesso."
        );
    }

    // ==========================================
    // NUMERAÇÃO AUTOMÁTICA NA NUVEM
    // ==========================================

    async function gerarNumeroOrcamento() {
        exigirNuvem();

        const ano = new Date().getFullYear();

        const { data, error } = await supabaseDados.rpc(
            "orcafacil_proximo_numero",
            { p_ano: ano }
        );

        if (error) {
            throw new Error(
                "Não foi possível gerar o número do orçamento: " +
                error.message
            );
        }

        const numeroSequencial = Number(data);

        if (
            !Number.isInteger(numeroSequencial) ||
            numeroSequencial < 1
        ) {
            throw new Error(
                "O Supabase devolveu um número de orçamento inválido."
            );
        }

        const contadores = lerJSONLocal(
            CHAVE_CONTADOR,
            {}
        );

        contadores[ano] = Math.max(
            Number(contadores[ano] || 0),
            numeroSequencial
        );

        guardarJSONLocal(
            CHAVE_CONTADOR,
            contadores
        );

        return "ORC-" + ano + "-" +
            String(numeroSequencial).padStart(4, "0");
    }

    // ==========================================
    // HISTÓRICO NA NUVEM
    // ==========================================

    function obterHistorico() {
        const historico = lerJSONLocal(
            CHAVE_HISTORICO,
            []
        );

        return Array.isArray(historico)
            ? historico
            : [];
    }

    function guardarHistoricoLocal(historico) {
        return guardarJSONLocal(
            CHAVE_HISTORICO,
            historico
        );
    }


    async function guardarNoHistorico() {
        exigirNuvem();

        const dados = dadosOrcamento();

        const { data, error } = await supabaseDados
            .rpc("orcafacil_guardar_orcamento", {
                p_id: orcamentoAtualId || null,
                p_dados: dados
            })
            .single();

        if (error) {
            console.error(
                "Erro ao guardar orçamento na nuvem:",
                error
            );

            mostrarMensagem(
                "Não foi possível guardar o orçamento na nuvem: " +
                error.message
            );

            return false;
        }

        const guardado = {
            ...(data.dados || dados),
            id: data.id,
            numero: data.numero
        };

        campo("numero").value = data.numero;

        const historico = obterHistorico();

        const indice = historico.findIndex(
            item => item.id === data.id
        );

        if (indice >= 0) {
            historico[indice] = guardado;
        } else {
            historico.push(guardado);
        }

        guardarHistoricoLocal(historico);

        orcamentoAtualId = data.id;

        return true;
    }




    async function eliminarOrcamentoDaNuvem(orcamento) {
        exigirNuvem();

        const { error } = await supabaseDados
            .from("orcafacil_orcamentos")
            .delete()
            .eq("user_id", utilizadorNuvemId)
            .eq("numero", orcamento.numero);
        if (error) {
            throw new Error(
                "Não foi possível eliminar o orçamento: " +
                error.message
            );
        }
    }
    // ==========================================
    // RESTAURAR ORÇAMENTO NO FORMULÁRIO
    // ==========================================

    function preencherFormulario(orcamento) {
        aRestaurarDados = true;

        campo("empresa").value = orcamento.empresa || "";
        campo("nifEmpresa").value =
            orcamento.nif || orcamento.nifEmpresa || "";
        campo("contacto").value = orcamento.contacto || "";
        campo("moradaEmpresa").value =
            orcamento.moradaEmpresa || "";

        campo("cliente").value = orcamento.cliente || "";
        campo("moradaObra").value = orcamento.moradaObra || "";
        campo("cliente").value = orcamento.cliente || "";
        campo("moradaObra").value = orcamento.moradaObra || "";

        // Restaurar o cliente associado ao orçamento.
        const seletorCliente = campo("clienteSelecionado");

        if (seletorCliente) {
            const clientes = lerJSONLocal(CHAVE_CLIENTES, []);

            let clienteId = orcamento.clienteId || "";

            // Compatibilidade com orçamentos antigos sem clienteId.
            if (!clienteId && orcamento.cliente) {
                const correspondencias = clientes.filter(c =>
                    String(c.nome || "").trim().toLowerCase() ===
                    String(orcamento.cliente).trim().toLowerCase()
                );

                if (correspondencias.length === 1) {
                    clienteId = correspondencias[0].id;
                }
            }

            seletorCliente.value = String(clienteId);

            if (seletorCliente.value !== String(clienteId)) {
                seletorCliente.value = "";
            }
        }

        campo("numero").value = orcamento.numero || "";
        campo("numero").value = orcamento.numero || "";
        campo("data").value = orcamento.data || "";
        campo("validade").value = orcamento.validade || "";
        campo("notas").value = orcamento.notas || "";
        campo("estadoOrcamento").value =
            orcamento.estado || "Pendente"
        linhas.innerHTML = "";

        if (
            Array.isArray(orcamento.items) &&
            orcamento.items.length > 0
        ) {
            orcamento.items.forEach(item => {
                adicionarLinha(
                    item.descricao || "",
                    item.quantidade ?? 1,
                    item.preco ?? 0,
                    Number(item.taxa ?? 23)
                );
            });
        } else {
            adicionarLinha();
        }

        orcamentoAtualId = orcamento.id || null;

        calcular();
        console.log("FORMULÁRIO PREENCHIDO");
        console.log("Cliente:", campo("cliente").value);
        console.log("Número:", campo("numero").value);
        console.log("Estado:", campo("estadoOrcamento").value);
        console.log("Formulário visível:", !form.hidden);
        console.log("Altura do formulário:", form.offsetHeight);
        aRestaurarDados = false;
    }

    // ==========================================
    // MOSTRAR HISTÓRICO
    // ==========================================

    function mostrarHistorico() {
        const secao = campo("historicoOrcamentos");
        const lista = campo("listaOrcamentos");

        const historico = obterHistorico();

        secao.hidden = false;
        lista.innerHTML = "";

        if (historico.length === 0) {
            lista.textContent =
                "Ainda não existem orçamentos guardados.";
            return;
        }

        historico.sort((a, b) => {
            const comparacaoData =
                String(b.data || "").localeCompare(
                    String(a.data || "")
                );

            if (comparacaoData !== 0) {
                return comparacaoData;
            }

            return String(b.numero || "").localeCompare(
                String(a.numero || "")
            );
        });

        historico.forEach(orcamento => {

            const elemento = document.createElement("div");
            elemento.className = "item-historico";

            const titulo = document.createElement("h3");
            titulo.textContent =
                orcamento.numero || "Sem número";

            const cliente = document.createElement("p");
            cliente.textContent =
                "Cliente: " + (orcamento.cliente || "-");

            const data = document.createElement("p");
            data.textContent =
                "Data: " + (orcamento.data || "-");
            const estado = document.createElement("p");
            estado.textContent =
                "Estado: " + (orcamento.estado || "Pendente");
            const total = (orcamento.items || []).reduce(
                (soma, item) => {

                    const base =
                        Number(item.quantidade || 0) *
                        Number(item.preco || 0);

                    return soma +
                        base +
                        base * Number(item.taxa || 0) / 100;
                },
                0
            );

            const valor = document.createElement("p");
            valor.textContent = "Total: " + euros(total);

            const botoes = document.createElement("div");
            botoes.className = "acoes";

            const abrir = document.createElement("button");
            abrir.type = "button";
            abrir.className = "secundario";
            abrir.textContent = "Abrir / Editar";
            abrir.dataset.acao = "abrir";
            abrir.dataset.id = orcamento.id;

            const duplicar = document.createElement("button");
            duplicar.type = "button";
            duplicar.className = "secundario";
            duplicar.textContent = "Duplicar";
            duplicar.dataset.acao = "duplicar";
            duplicar.dataset.id = orcamento.id;

            const eliminar = document.createElement("button");
            eliminar.type = "button";
            eliminar.className = "remover";
            eliminar.textContent = "Eliminar";
            eliminar.dataset.acao = "eliminar";
            eliminar.dataset.id = orcamento.id;

            botoes.append(
                abrir,
                duplicar,
                eliminar
            );

            elemento.append(
                titulo,
                cliente,
                data,
                estado,
                valor,
                botoes
            );

            lista.append(elemento);
        });
    }
    // ==========================================
    // CÓPIAS DE SEGURANÇA
    // ==========================================

    function exportarBackup() {
        try {
            const dados = {};

            CHAVES_BACKUP.forEach(chave => {
                dados[chave] = localStorage.getItem(chave);
            });

            const backup = {
                versao: 1,
                dataCriacao: new Date().toISOString(),
                dados
            };

            const ficheiro = new Blob(
                [JSON.stringify(backup, null, 2)],
                { type: "application/json" }
            );

            const url = URL.createObjectURL(ficheiro);
            const link = document.createElement("a");

            link.href = url;
            link.download =
                "orcafacil-backup-" +
                new Date().toISOString().slice(0, 10) +
                ".json";

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);

            alert(
                "Cópia de segurança criada com sucesso!"
            );

        } catch (erro) {
            console.error(erro);

            alert(
                "Não foi possível criar a cópia de segurança."
            );
        }
    }

    async function importarBackupNaNuvem(dadosBackup) {
        exigirNuvem();

        const perfil = dadosBackup[CHAVE_PROFISSIONAL]
            ? JSON.parse(dadosBackup[CHAVE_PROFISSIONAL])
            : {};

        const rascunho = dadosBackup[CHAVE_RASCUNHO]
            ? JSON.parse(dadosBackup[CHAVE_RASCUNHO])
            : null;

        const historico = dadosBackup[CHAVE_HISTORICO]
            ? JSON.parse(dadosBackup[CHAVE_HISTORICO])
            : [];

        const contadores = dadosBackup[CHAVE_CONTADOR]
            ? JSON.parse(dadosBackup[CHAVE_CONTADOR])
            : {};

        if (
            !Array.isArray(historico) ||
            !contadores ||
            typeof contadores !== "object"
        ) {
            throw new Error(
                "Os dados do histórico ou dos contadores não são válidos."
            );
        }

        const { error: erroPerfil } = await supabaseDados
            .from("orcafacil_perfis")
            .upsert({
                user_id: utilizadorNuvemId,
                dados: perfil
            });

        if (erroPerfil) {
            throw new Error(
                "Erro ao importar o perfil: " +
                erroPerfil.message
            );
        }

        if (rascunho) {
            const { error } = await supabaseDados
                .from("orcafacil_rascunhos")
                .upsert({
                    user_id: utilizadorNuvemId,
                    dados: rascunho
                });

            if (error) {
                throw new Error(
                    "Erro ao importar o rascunho: " +
                    error.message
                );
            }
        }

        const registosContador = Object.entries(contadores)
            .map(([ano, ultimo_numero]) => ({
                user_id: utilizadorNuvemId,
                ano: Number(ano),
                ultimo_numero: Number(ultimo_numero)
            }))
            .filter(item =>
                Number.isInteger(item.ano) &&
                Number.isInteger(item.ultimo_numero) &&
                item.ultimo_numero >= 0
            );

        // IMPORTAR CONTADORES
        if (registosContador.length) {
            const { error } = await supabaseDados
                .from("orcafacil_contadores")
                .upsert(registosContador, {
                    onConflict: "user_id,ano"
                });

            if (error) {
                throw new Error(
                    "Erro ao importar os contadores: " +
                    error.message
                );
            }
        }


        // IMPORTAR CLIENTES
        const clientes = dadosBackup[CHAVE_CLIENTES]
            ? JSON.parse(dadosBackup[CHAVE_CLIENTES])
            : [];

        if (!Array.isArray(clientes)) {
            throw new Error(
                "A lista de clientes da cópia não é válida."
            );
        }

        if (clientes.length) {
            // Consultar os clientes que já existem na conta.
            const { data: clientesExistentes, error: erroClientes } =
                await supabaseDados
                    .from("orcafacil_clientes")
                    .select("nome,nif,telefone,email,morada")
                    .eq("user_id", utilizadorNuvemId);

            if (erroClientes) {
                throw new Error(
                    "Erro ao consultar os clientes existentes: " +
                    erroClientes.message
                );
            }

            // Normalizar texto para comparar os campos.
            const normalizar = valor =>
                String(valor || "")
                    .trim()
                    .toLowerCase();

            const normalizarNif = valor =>
                String(valor || "")
                    .replace(/\s/g, "")
                    .toUpperCase();

            const clientesParaComparar = [...(clientesExistentes || [])];

            const novosClientes = [];

            for (const cliente of clientes) {
                if (!cliente || !cliente.nome) continue;

                const nif = normalizarNif(cliente.nif);

                const duplicado = clientesParaComparar.some(existente => {
                    const nifExistente = normalizarNif(existente.nif);

                    // Se ambos tiverem NIF, comparar pelo NIF.
                    if (nif && nifExistente) {
                        return nif === nifExistente;
                    }

                    // Sem NIF, comparar os restantes dados.
                    return (
                        normalizar(cliente.nome) === normalizar(existente.nome) &&
                        normalizar(cliente.email) === normalizar(existente.email) &&
                        normalizar(cliente.telefone) === normalizar(existente.telefone) &&
                        normalizar(cliente.morada) === normalizar(existente.morada)
                    );
                });

                if (!duplicado) {
                    novosClientes.push(cliente);

                    // Impede também duplicados dentro do próprio ficheiro.
                    clientesParaComparar.push(cliente);
                }
            }

            if (novosClientes.length) {
                const registosClientes = novosClientes.map(cliente => ({
                    user_id: utilizadorNuvemId,
                    nome: cliente.nome,
                    nif: cliente.nif || "",
                    telefone: cliente.telefone || "",
                    email: cliente.email || "",
                    morada: cliente.morada || ""
                }));

                const { error } = await supabaseDados
                    .from("orcafacil_clientes")
                    .insert(registosClientes);

                if (error) {
                    throw new Error(
                        "Erro ao importar clientes: " +
                        error.message
                    );
                }
            }

            console.log(
                "Clientes importados:",
                novosClientes.length
            );
        }


        // Os orçamentos são adicionados ou atualizados por número.
        // Os restantes orçamentos existentes não são apagados.

        for (const orcamento of historico) {
            if (!orcamento || !orcamento.numero) continue;

            const { error } = await supabaseDados
                .from("orcafacil_orcamentos")
                .upsert({
                    user_id: utilizadorNuvemId,
                    numero: orcamento.numero,
                    dados: orcamento
                }, {
                    onConflict: "user_id,numero"
                });

            if (error) {
                throw new Error(
                    "Erro ao importar o orçamento " +
                    orcamento.numero + ": " +
                    error.message
                );
            }
        }
    }

    async function importarBackup(ficheiro) {
        if (!ficheiro) return;

        try {
            const texto = await ficheiro.text();
            const backup = JSON.parse(texto);

            if (
                backup.versao !== 1 ||
                !backup.dados ||
                typeof backup.dados !== "object"
            ) {
                throw new Error(
                    "Formato de cópia inválido."
                );
            }

            const valido = CHAVES_BACKUP.every(chave =>
                Object.prototype.hasOwnProperty.call(
                    backup.dados,
                    chave
                )
            );

            if (!valido) {
                throw new Error(
                    "Faltam dados na cópia de segurança."
                );
            }

            const confirmar = confirm(
                "Os dados profissionais e o rascunho serão substituídos. " +
                "Os orçamentos do ficheiro serão adicionados ou atualizados " +
                "na nuvem; os restantes orçamentos existentes não serão " +
                "eliminados. Queres continuar?"
            );

            if (!confirmar) return;

            await importarBackupNaNuvem(backup.dados);

            CHAVES_BACKUP.forEach(chave => {

                const valor = backup.dados[chave];

                if (valor === null) {
                    localStorage.removeItem(chave);

                } else if (typeof valor === "string") {
                    localStorage.setItem(chave, valor);

                } else {
                    throw new Error(
                        "Dados inválidos no ficheiro de cópia."
                    );
                }
            });

            alert(
                "Cópia de segurança importada para a tua conta. " +
                "A página vai ser atualizada."
            );

            location.reload();

        } catch (erro) {
            console.error(erro);

            alert(
                "Não foi possível importar a cópia de segurança: " +
                erro.message
            );

        } finally {
            campo("ficheiroBackup").value = "";
        }
    }

    // ==========================================
    // PDF
    // ==========================================

    function escreverTextoPDF(
        doc,
        texto,
        x,
        y,
        largura = 174
    ) {
        const partes = doc.splitTextToSize(
            String(texto || ""),
            largura
        );

        const altura = partes.length * 5;

        if (y + altura > 275) {
            doc.addPage();
            y = 20;
        }

        doc.text(partes, x, y);

        return y + altura;
    }
    async function gerarPDF(descarregar = true) {

        if (!window.jspdf || !window.jspdf.jsPDF) {
            mostrarMensagem(
                "Biblioteca PDF não carregada. Atualiza a página."
            );

            console.error("jsPDF não está disponível.");
            return;
        }

        try {
            const d = dadosOrcamento();
            const logotipo = await obterLogotipo();

            const doc = new window.jspdf.jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4"
            });

            const azul = [36, 86, 179];
            const azulClaro = [235, 242, 252];
            const cinza = [90, 100, 115];
            const escuro = [35, 45, 60];

            const margem = 18;
            const largura = 174;

            let y = 20;

            // CABEÇALHO

            doc.setFillColor(...azul);
            doc.rect(0, 0, 210, 43, "F");

            doc.setDrawColor(255, 255, 255);
            doc.setLineWidth(0.5);

            doc.roundedRect(
                18, 10, 25, 23, 2, 2, "S"
            );

            if (logotipo) {
                const propriedades =
                    doc.getImageProperties(logotipo);

                const proporcao = Math.min(
                    22 / propriedades.width,
                    20 / propriedades.height
                );

                const larguraImagem =
                    propriedades.width * proporcao;

                const alturaImagem =
                    propriedades.height * proporcao;

                const xImagem =
                    18 + (25 - larguraImagem) / 2;

                const yImagem =
                    10 + (23 - alturaImagem) / 2;

                const formato =
                    logotipo.startsWith("data:image/png")
                        ? "PNG"
                        : "JPEG";

                doc.addImage(
                    logotipo,
                    formato,
                    xImagem,
                    yImagem,
                    larguraImagem,
                    alturaImagem
                );

            } else {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);

                doc.text(
                    "LOGÓTIPO",
                    30.5,
                    23,
                    { align: "center" }
                );
            }

            doc.setFontSize(21);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(255, 255, 255);

            doc.text("ORÇAMENTO", 52, 19);

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");

            doc.text("PROPOSTA COMERCIAL", 52, 27);

            doc.setFontSize(10);

            doc.text(
                "N.º " + d.numero,
                192,
                19,
                { align: "right" }
            );

            y = 55;

            // PRESTADOR E CLIENTE

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...azul);

            doc.text(
                "PRESTADOR DE SERVIÇOS",
                margem,
                y
            );

            doc.text("CLIENTE", 112, y);

            y += 8;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...escuro);

            doc.text(d.empresa || "-", margem, y);
            doc.text(d.cliente || "-", 112, y);

            y += 6;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...cinza);

            let yEmpresa = y;
            let yCliente = y;

            if (d.nif) {
                yEmpresa = escreverTextoPDF(
                    doc,
                    "NIF: " + d.nif,
                    margem,
                    yEmpresa,
                    80
                );
            }

            if (d.contacto) {
                yEmpresa = escreverTextoPDF(
                    doc,
                    "Contacto: " + d.contacto,
                    margem,
                    yEmpresa,
                    80
                );
            }
            if (d.moradaEmpresa) {
                yEmpresa = escreverTextoPDF(
                    doc,
                    "Morada: " + d.moradaEmpresa,
                    margem,
                    yEmpresa,
                    80
                );
            }

            if (d.moradaObra) {
                yCliente = escreverTextoPDF(
                    doc,
                    "Local da obra: " + d.moradaObra,
                    112,
                    yCliente,
                    80
                );
            }

            y = Math.max(yEmpresa, yCliente) + 8;
            // DATA E VALIDADE

            doc.setFillColor(...azulClaro);

            doc.roundedRect(
                margem,
                y - 5,
                largura,
                17,
                2,
                2,
                "F"
            );

            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(...azul);

            doc.text("DATA", margem + 5, y + 1);
            doc.text(
                "VALIDADE DA PROPOSTA",
                100,
                y + 1
            );

            doc.setFont("helvetica", "normal");
            doc.setTextColor(...escuro);

            doc.text(d.data || "-", margem + 5, y + 7);
            doc.text(d.validade || "-", 100, y + 7);

            y += 25;

            // TÍTULO DOS TRABALHOS

            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(...azul);

            doc.text(
                "TRABALHOS E MATERIAIS",
                margem,
                y
            );

            y += 7;

            // CABEÇALHO DA TABELA

            function cabecalhoTabela() {
                doc.setFillColor(...azul);

                doc.rect(
                    margem,
                    y - 5,
                    largura,
                    10,
                    "F"
                );

                doc.setFont("helvetica", "bold");
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);

                doc.text("DESCRIÇÃO", 21, y + 1);

                doc.text(
                    "QTD.",
                    105,
                    y + 1,
                    { align: "right" }
                );

                doc.text(
                    "PREÇO UNIT.",
                    143,
                    y + 1,
                    { align: "right" }
                );

                doc.text(
                    "IVA",
                    166,
                    y + 1,
                    { align: "right" }
                );

                doc.text(
                    "TOTAL",
                    190,
                    y + 1,
                    { align: "right" }
                );

                y += 11;
            }

            cabecalhoTabela();

            // LINHAS DOS TRABALHOS

            d.items.forEach((item, indice) => {

                const descricao = doc.splitTextToSize(
                    item.descricao,
                    70
                );

                const altura = Math.max(
                    9,
                    descricao.length * 4.5
                );

                if (y + altura > 260) {
                    doc.addPage();
                    y = 20;
                    cabecalhoTabela();
                }

                if (indice % 2 === 0) {
                    doc.setFillColor(248, 250, 253);

                    doc.rect(
                        margem,
                        y - 5,
                        largura,
                        altura + 2,
                        "F"
                    );
                }

                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(...escuro);

                doc.text(descricao, 21, y);

                doc.text(
                    String(item.quantidade),
                    105,
                    y,
                    { align: "right" }
                );

                doc.text(
                    euros(item.preco),
                    143,
                    y,
                    { align: "right" }
                );

                doc.text(
                    Number(item.taxa).toLocaleString("pt-PT") + "%",
                    166,
                    y,
                    { align: "right" }
                );

                doc.text(
                    euros(item.base),
                    190,
                    y,
                    { align: "right" }
                );

                y += altura + 3;

                doc.setDrawColor(225, 231, 240);

                doc.line(
                    margem,
                    y - 2,
                    192,
                    y - 2
                );
            });
            // TOTAIS

            const subtotal = d.items.reduce(
                (soma, item) => soma + item.base,
                0
            );

            const ivaTotal = d.items.reduce(
                (soma, item) => soma + item.iva,
                0
            );

            const total = subtotal + ivaTotal;

            if (y + 48 > 270) {
                doc.addPage();
                y = 25;
            }

            y += 8;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(...escuro);

            doc.text("Subtotal:", 135, y);

            doc.text(
                euros(subtotal),
                190,
                y,
                { align: "right" }
            );

            y += 7;

            doc.text("IVA total:", 135, y);

            doc.text(
                euros(ivaTotal),
                190,
                y,
                { align: "right" }
            );

            y += 7;

            // TOTAL DESTACADO

            doc.setFillColor(...azulClaro);

            doc.roundedRect(
                112,
                y - 5,
                80,
                18,
                2,
                2,
                "F"
            );

            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.setTextColor(...azul);

            doc.text("TOTAL", 117, y + 5);

            doc.setFontSize(12);

            doc.text(
                euros(total),
                187,
                y + 5,
                { align: "right" }
            );

            y += 25;

            // CONDIÇÕES E OBSERVAÇÕES

            if (d.notas) {
                if (y + 30 > 270) {
                    doc.addPage();
                    y = 25;
                }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.setTextColor(...azul);

                doc.text(
                    "CONDIÇÕES E OBSERVAÇÕES",
                    margem,
                    y
                );

                y += 7;

                doc.setFont("helvetica", "normal");
                doc.setFontSize(9);
                doc.setTextColor(...escuro);

                y = escreverTextoPDF(
                    doc,
                    d.notas,
                    margem,
                    y,
                    largura
                );

                y += 12;
            }

            // ASSINATURAS


            // ACEITAÇÃO E ASSINATURAS

            if (y + 55 > 270) {
                doc.addPage();
                y = 25;
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...azul);

            doc.text(
                "ACEITAÇÃO DO ORÇAMENTO",
                margem,
                y
            );

            y += 7;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...escuro);

            y = escreverTextoPDF(
                doc,
                "Declaro que aceito o presente orçamento e as condições e observações nele indicadas.",
                margem,
                y,
                largura
            );

            y += 10;

            doc.setDrawColor(160, 170, 185);
            doc.setLineWidth(0.3);

            // ASSINATURA DO PROFISSIONAL

            doc.line(
                margem,
                y + 12,
                85,
                y + 12
            );

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...cinza);

            doc.text(
                "Assinatura do profissional",
                margem,
                y + 18
            );

            // ASSINATURA DO CLIENTE

            doc.line(
                125,
                y + 12,
                192,
                y + 12
            );

            doc.text(
                "Assinatura do cliente",
                125,
                y + 18
            );

            doc.text(
                "Nome: " + (d.cliente || "-"),
                125,
                y + 24
            );

            doc.text(
                "Data de aceitação: ____ / ____ / ______",
                125,
                y + 30
            );

            // RODAPÉ E PAGINAÇÃO

            const paginas = doc.getNumberOfPages();

            for (let pagina = 1; pagina <= paginas; pagina++) {
                doc.setPage(pagina);

                doc.setDrawColor(220, 225, 232);

                doc.line(18, 282, 192, 282);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(7);
                doc.setTextColor(...cinza);

                doc.text(
                    "OrçaFácil | Proposta comercial — não constitui fatura",
                    18,
                    288
                );

                doc.text(
                    "Página " + pagina + " de " + paginas,
                    192,
                    288,
                    { align: "right" }
                );
            }

            // DESCARREGAR PDF

            const nomeSeguro = d.numero.replace(
                /[^a-zA-Z0-9_-]/g,
                "_"
            );

            if (descarregar) {
                doc.save(
                    "Orcamento_" +
                    (nomeSeguro || "novo") +
                    ".pdf"
                );
            }

            mostrarMensagem(
                "PDF profissional gerado com sucesso!"
            );
            return doc;
        } catch (erro) {
            console.error("Erro ao gerar PDF:", erro);

            mostrarMensagem(
                erro.message ||
                "Não foi possível gerar o PDF. Consulta a consola."
            );
        }
    }
    // ==========================================
    // VALIDAÇÃO
    // ==========================================

    function validarNIFPortugal(nif) {
        nif = String(nif || "").replace(/\s/g, "");

        if (!/^\d{9}$/.test(nif)) return false;

        const numeros = nif.split("").map(Number);

        let soma = 0;

        for (let i = 0; i < 8; i++) {
            soma += numeros[i] * (9 - i);
        }

        const resto = soma % 11;

        const digitoControlo =
            resto < 2 ? 0 : 11 - resto;

        return digitoControlo === numeros[8];
    }

    function formularioValido() {
        if (!form.reportValidity()) return false;

        const nif = campo("nifEmpresa").value.trim();

        if (nif && !validarNIFPortugal(nif)) {
            mostrarMensagem(
                "O NIF da empresa não é válido. Verifica os 9 algarismos."
            );

            campo("nifEmpresa").focus();
            return false;
        }

        if (
            campo("data").value >
            campo("validade").value
        ) {
            mostrarMensagem(
                "A validade não pode ser anterior à data do orçamento."
            );

            return false;
        }

        return validarLinhas();
    }
    // ==========================================
    // EVENTOS
    // ==========================================
    async function guardarClienteNaNuvem(cliente) {
        exigirNuvem();

        const { data, error } = await supabaseDados
            .from("orcafacil_clientes")
            .insert({
                user_id: utilizadorNuvemId,
                nome: cliente.nome,
                nif: cliente.nif,
                telefone: cliente.telefone,
                email: cliente.email,
                morada: cliente.morada
            })
            .select("id,nome,nif,telefone,email,morada")
            .single();

        if (error) {
            throw new Error("Erro ao guardar o cliente: " + error.message);
        }

        const clientes = lerJSONLocal(CHAVE_CLIENTES, []);
        clientes.push(data);

        guardarJSONLocal(CHAVE_CLIENTES, clientes);

        mostrarClientes();
        atualizarSeletorClientes();

        return data;
    }

    async function atualizarClienteNaNuvem(id, cliente) {
        exigirNuvem();

        const { data, error } = await supabaseDados
            .from("orcafacil_clientes")
            .update({
                nome: cliente.nome,
                nif: cliente.nif,
                telefone: cliente.telefone,
                email: cliente.email,
                morada: cliente.morada
            })
            .eq("id", id)
            .eq("user_id", utilizadorNuvemId)
            .select("id,nome,nif,telefone,email,morada")
            .single();

        if (error) {
            throw new Error("Erro ao atualizar o cliente: " + error.message);
        }

        const clientes = lerJSONLocal(CHAVE_CLIENTES, []);
        const indice = clientes.findIndex(c => String(c.id) === String(id));

        if (indice >= 0) {
            clientes[indice] = data;
        }

        guardarJSONLocal(CHAVE_CLIENTES, clientes);

        mostrarClientes();
        atualizarSeletorClientes();

        return data;
    }

    async function eliminarClienteNaNuvem(id) {
        exigirNuvem();

        const { error } = await supabaseDados
            .from("orcafacil_clientes")
            .delete()
            .eq("id", id)
            .eq("user_id", utilizadorNuvemId);

        if (error) {
            throw new Error("Erro ao eliminar o cliente: " + error.message);
        }

        const clientes = lerJSONLocal(CHAVE_CLIENTES, [])
            .filter(c => String(c.id) !== String(id));

        guardarJSONLocal(CHAVE_CLIENTES, clientes);

        mostrarClientes();
        atualizarSeletorClientes();
    }
    function mostrarClientes() {
        const lista = campo("listaClientes");
        if (!lista) return;

        const clientes = lerJSONLocal(CHAVE_CLIENTES, []);

        lista.innerHTML = "";

        if (!clientes.length) {
            lista.textContent = "Ainda não existem clientes registados.";
            return;
        }

        clientes.forEach(cliente => {
            const elemento = document.createElement("div");
            elemento.className = "item-historico";

            const titulo = document.createElement("h3");
            titulo.textContent = cliente.nome;

            const nif = document.createElement("p");
            nif.textContent = "NIF: " + (cliente.nif || "-");

            const telefone = document.createElement("p");
            telefone.textContent = "Telefone: " + (cliente.telefone || "-");

            const email = document.createElement("p");
            email.textContent = "Email: " + (cliente.email || "-");

            const morada = document.createElement("p");
            morada.textContent = "Morada: " + (cliente.morada || "-");

            const botoes = document.createElement("div");
            botoes.className = "acoes";

            const editar = document.createElement("button");
            editar.type = "button";
            editar.className = "secundario";
            editar.textContent = "Editar";
            editar.dataset.acaoCliente = "editar";
            editar.dataset.id = cliente.id;

            const eliminar = document.createElement("button");
            eliminar.type = "button";
            eliminar.className = "remover";
            eliminar.textContent = "Eliminar";
            eliminar.dataset.acaoCliente = "eliminar";
            eliminar.dataset.id = cliente.id;

            botoes.append(editar, eliminar);

            elemento.append(
                titulo, nif, telefone, email, morada, botoes
            );

            lista.append(elemento);
        });
    }

    function atualizarSeletorClientes() {
        const seletor = campo("clienteSelecionado");
        if (!seletor) return;

        const valorAnterior = seletor.value;
        const clientes = lerJSONLocal(CHAVE_CLIENTES, []);

        seletor.innerHTML = "";

        const opcaoInicial = document.createElement("option");
        opcaoInicial.value = "";
        opcaoInicial.textContent = "Selecionar um cliente...";

        seletor.append(opcaoInicial);

        clientes.forEach(cliente => {
            const opcao = document.createElement("option");
            opcao.value = cliente.id;
            opcao.textContent = cliente.nome;
            seletor.append(opcao);
        });

        seletor.value = valorAnterior;
    }
    function instalarEventos() {
        if (eventosInstalados) return;

        eventosInstalados = true;

        campo("adicionar").addEventListener("click", () => {
            adicionarLinha();
            guardarRascunho();
        });

        linhas.addEventListener("input", () => {
            calcular();
            guardarRascunho();
        });

        linhas.addEventListener("change", () => {
            calcular();
            guardarRascunho();
        });

        linhas.addEventListener("click", event => {
            const botao = event.target.closest(".remover");

            if (botao) {
                botao.closest(".linha-trabalho").remove();
                calcular();
                guardarRascunho();
            }
        });

        // GESTÃO DE CLIENTES

        let clienteEmEdicao = null;

        const botaoNovoCliente = campo("mostrarFormularioCliente");
        const botaoGuardarCliente = campo("guardarCliente");
        const botaoCancelarCliente = campo("cancelarCliente");

        botaoNovoCliente.addEventListener("click", () => {
            clienteEmEdicao = null;

            campo("nomeCliente").value = "";
            campo("nifCliente").value = "";
            campo("telefoneCliente").value = "";
            campo("emailCliente").value = "";
            campo("moradaCliente").value = "";

            botaoGuardarCliente.textContent = "Guardar cliente";
            campo("mensagemCliente").textContent = "";
            campo("formularioCliente").hidden = false;

            campo("nomeCliente").focus();
        });

        botaoCancelarCliente.addEventListener("click", () => {
            clienteEmEdicao = null;
            campo("formularioCliente").hidden = true;
            campo("mensagemCliente").textContent = "";
        });

        botaoGuardarCliente.addEventListener("click", async () => {
            const cliente = {
                nome: campo("nomeCliente").value.trim(),
                nif: campo("nifCliente").value.trim(),
                telefone: campo("telefoneCliente").value.trim(),
                email: campo("emailCliente").value.trim(),
                morada: campo("moradaCliente").value.trim()
            };

            if (!cliente.nome) {
                campo("mensagemCliente").textContent =
                    "O nome do cliente é obrigatório.";
                return;
            }

            botaoGuardarCliente.disabled = true;
            campo("mensagemCliente").textContent = "A guardar...";

            try {
                if (clienteEmEdicao) {
                    await atualizarClienteNaNuvem(clienteEmEdicao, cliente);
                } else {
                    await guardarClienteNaNuvem(cliente);
                }

                clienteEmEdicao = null;
                campo("formularioCliente").hidden = true;
                campo("mensagemCliente").textContent =
                    "Cliente guardado com sucesso!";

                [
                    "nomeCliente",
                    "nifCliente",
                    "telefoneCliente",
                    "emailCliente",
                    "moradaCliente"
                ].forEach(id => campo(id).value = "");

            } catch (erro) {
                console.error(erro);
                campo("mensagemCliente").textContent = erro.message;

            } finally {
                botaoGuardarCliente.disabled = false;
            }
        });

        // EDITAR E ELIMINAR

        campo("listaClientes").addEventListener("click", async event => {
            const botao = event.target.closest("button[data-acao-cliente]");
            if (!botao) return;

            const id = botao.dataset.id;
            const acao = botao.dataset.acaoCliente;

            const clientes = lerJSONLocal(CHAVE_CLIENTES, []);
            const cliente = clientes.find(c => String(c.id) === String(id));

            if (!cliente) return;

            if (acao === "editar") {
                clienteEmEdicao = id;

                campo("nomeCliente").value = cliente.nome || "";
                campo("nifCliente").value = cliente.nif || "";
                campo("telefoneCliente").value = cliente.telefone || "";
                campo("emailCliente").value = cliente.email || "";
                campo("moradaCliente").value = cliente.morada || "";

                botaoGuardarCliente.textContent = "Atualizar cliente";
                campo("mensagemCliente").textContent = "";
                campo("formularioCliente").hidden = false;

                campo("nomeCliente").focus();
            }


            if (acao === "eliminar") {
                try {
                    // Consultar os orçamentos guardados deste utilizador.
                    const { data: orcamentos, error } = await supabaseDados
                        .from("orcafacil_orcamentos")
                        .select("dados")
                        .eq("user_id", utilizadorNuvemId);

                    if (error) {
                        throw new Error(
                            "Não foi possível verificar os orçamentos: " +
                            error.message
                        );
                    }

                    // Comparar o nome do cliente com o nome guardado nos orçamentos.
                    const nomeCliente = String(cliente.nome || "")
                        .trim()
                        .toLowerCase();

                    const quantidade = (orcamentos || []).filter(orcamento => {
                        const dados = orcamento.dados || {};

                        // Orçamentos novos: comparar pelo ID do cliente.
                        if (dados.clienteId) {
                            return String(dados.clienteId) === String(cliente.id);
                        }

                        // Orçamentos antigos: continuar a comparar pelo nome.
                        return String(dados.cliente || "")
                            .trim()
                            .toLowerCase() === nomeCliente;
                    }).length;

                    // Preparar a mensagem de confirmação.
                    let mensagemConfirmacao;

                    if (quantidade > 0) {
                        mensagemConfirmacao =
                            `Este cliente tem ${quantidade} orçamento(s) guardado(s).\n\n` +
                            "Se continuares, o cliente será eliminado da Gestão de Clientes, " +
                            "mas os orçamentos serão mantidos no histórico.\n\n" +
                            "Queres continuar?";
                    } else {
                        mensagemConfirmacao =
                            "Este cliente não tem orçamentos associados.\n\n" +
                            "Queres eliminá-lo?";
                    }

                    if (!confirm(mensagemConfirmacao)) return;

                    // Eliminar apenas o cliente. Os orçamentos não são alterados.
                    await eliminarClienteNaNuvem(id);

                    mostrarMensagem("Cliente eliminado com sucesso.");

                } catch (erro) {
                    console.error(erro);
                    mostrarMensagem(erro.message);
                }
            }

        });



        // SELECIONAR CLIENTE NO ORÇAMENTO

        campo("clienteSelecionado").addEventListener("change", () => {
            const id = campo("clienteSelecionado").value;

            const clientes = lerJSONLocal(CHAVE_CLIENTES, []);

            if (!id) {
                campo("cliente").value = "";
                campo("moradaObra").value = "";
                guardarRascunho();
                return;
            }

            const cliente = clientes.find(
                c => String(c.id) === String(id)
            );

            if (!cliente) return;

            campo("cliente").value = cliente.nome || "";
            campo("moradaObra").value = cliente.morada || "";

            guardarRascunho();
        });


        // AÇÕES DO HISTÓRICO

        campo("listaOrcamentos").addEventListener(
            "click",
            async event => {

                const botao = event.target.closest(
                    "button[data-acao]"
                );

                if (!botao) return;

                const id = botao.dataset.id;
                const acao = botao.dataset.acao;

                const historico = obterHistorico();

                console.log("ENTREI NO EVENTO DE ABRIR HISTÓRICO");
                const orcamento = historico.find(
                    item => String(item.id) === String(id)
                );
                console.log("ID clicado:", id);
                console.log("Histórico:", historico);
                console.log("Orçamento encontrado:", orcamento);

                if (!orcamento) {
                    mostrarMensagem(
                        "Não foi possível encontrar esse orçamento."
                    );
                    return;
                }

                try {

                    if (acao === "abrir") {
                        // Carregar o orçamento selecionado
                        preencherFormulario(orcamento);

                        // Fechar o histórico
                        campo("historicoOrcamentos").hidden = true;

                        // Guardar o orçamento carregado como rascunho
                        guardarRascunho();

                        // Informar o utilizador
                        mostrarMensagem("Orçamento carregado para edição.");

                        // Abrir visualmente o formulário
                        form.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });
                    }


                    if (acao === "duplicar") {

                        const copia = {
                            ...orcamento,
                            numero: "",
                            data: new Date(
                                Date.now() - new Date().getTimezoneOffset() * 60000
                            ).toISOString().slice(0, 10),
                            id: null,
                            atualizadoEm: new Date().toISOString()
                        };

                        preencherFormulario(copia);

                        orcamentoAtualId = null;

                        guardarRascunho();

                        campo("historicoOrcamentos").hidden = true;

                        mostrarMensagem(
                            "Orçamento duplicado. O número será atribuído quando for guardado."
                        );

                        form.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });
                    }

                    if (acao === "eliminar") {
                        if (!confirm(
                            "Tens a certeza de que queres eliminar este orçamento?"
                        )) {
                            return;
                        }

                        await eliminarOrcamentoDaNuvem(orcamento);

                        guardarHistoricoLocal(
                            historico.filter(
                                item => item.numero !== orcamento.numero
                            )
                        );

                        if (orcamentoAtualId === id) {
                            orcamentoAtualId = null;
                        }

                        mostrarHistorico();

                        mostrarMensagem(
                            "Orçamento eliminado da nuvem."
                        );
                    }

                } catch (erro) {
                    console.error(erro);
                    mostrarMensagem(erro.message);
                }
            }
        );
        // ABRIR HISTÓRICO

        campo("abrirHistorico").addEventListener("click", () => {
            mostrarHistorico();

            campo("historicoOrcamentos").scrollIntoView({
                behavior: "smooth"
            });
        });

        campo("abrirClientes").addEventListener("click", () => {
            abrirPagina("clientes");

            campo("gestaoClientes").scrollIntoView({
                behavior: "smooth"
            });
        });

        // NOVO ORÇAMENTO

        campo("novoOrcamento").addEventListener(
            "click",
            async () => {

                if (!confirm(
                    "Queres guardar o orçamento atual e começar um novo?"
                )) {
                    return;
                }

                try {
                    const temConteudo =
                        campo("cliente").value.trim() ||
                        obterLinhas().some(
                            item => item.descricao.trim()
                        );

                    if (
                        temConteudo &&
                        !await guardarNoHistorico()
                    ) {
                        return;
                    }

                    const empresa = dadosProfissional();

                    aRestaurarDados = true;

                    form.reset();
                    linhas.innerHTML = "";

                    campo("empresa").value =
                        empresa.empresa || "";

                    campo("nifEmpresa").value =
                        empresa.nifEmpresa || "";

                    campo("contacto").value =
                        empresa.contacto || "";

                    campo("moradaEmpresa").value =
                        empresa.moradaEmpresa || "";

                    iniciarDatas();

                    adicionarLinha();

                    campo("numero").value = "";

                    orcamentoAtualId = null;

                    aRestaurarDados = false;

                    guardarDadosProfissional();
                    calcular();
                    guardarRascunho();

                    campo("historicoOrcamentos").hidden = true;

                    abrirPagina("orcamentos");

                    mostrarMensagem(
                        "Novo orçamento criado. O número será atribuído quando for guardado."
                    );

                    window.scrollTo({
                        top: 0,
                        behavior: "smooth"
                    });

                } catch (erro) {
                    aRestaurarDados = false;
                    console.error(erro);
                    mostrarMensagem(erro.message);
                }
            }
        );
        // DADOS PROFISSIONAIS

        [
            "empresa",
            "nifEmpresa",
            "contacto",
            "moradaEmpresa"
        ].forEach(id => {
            campo(id).addEventListener(
                "input",
                guardarDadosProfissional
            );

            campo(id).addEventListener(
                "change",
                guardarDadosProfissional
            );
        });

        // LOGÓTIPO

        campo("logotipo").addEventListener(
            "change",
            async () => {
                try {
                    await obterLogotipo();

                    mostrarMensagem(
                        "Logótipo guardado na tua conta."
                    );

                } catch (erro) {
                    mostrarMensagem(erro.message);
                    campo("logotipo").value = "";
                }
            }
        );

        // CAMPOS DO RASCUNHO

        [
            "cliente",
            "moradaObra",
            "numero",
            "data",
            "validade",
            "notas"
        ].forEach(id => {
            campo(id).addEventListener(
                "input",
                guardarRascunho
            );

            campo(id).addEventListener(
                "change",
                guardarRascunho
            );
        });

        // GERAR PDF

        form.addEventListener("submit", async event => {
            event.preventDefault();
            event.stopPropagation();

            mostrarMensagem("");

            if (!formularioValido()) return;

            try {
                await sincronizarGravacoesPendentes();

                if (!await guardarNoHistorico()) return;

                await guardarRascunhoNaNuvem();

                await gerarPDF();

                mostrarHistorico();

            } catch (erro) {
                console.error(erro);
                mostrarMensagem(erro.message);
            }
        });

        // IMPRIMIR

        campo("imprimir").addEventListener(
            "click",
            async () => {

                mostrarMensagem("");

                if (!formularioValido()) return;

                try {
                    await sincronizarGravacoesPendentes();

                    if (!await guardarNoHistorico()) return;

                    await guardarRascunhoNaNuvem();

                    mostrarMensagem(
                        "Orçamento guardado na nuvem."
                    );

                    window.print();

                    mostrarHistorico();

                } catch (erro) {
                    console.error(erro);
                    mostrarMensagem(erro.message);
                }
            }
        );



        // JANELA E ENVIO DE ORÇAMENTO POR EMAIL

        const janelaEmail = campo("janelaEmail");
        const emailDestino = campo("emailDestino");
        const botaoCancelarEmail = campo("cancelarEmail");
        const botaoConfirmarEmail = campo("confirmarEmail");

        // Abrir janela de envio
        campo("enviarEmail").addEventListener("click", () => {

            mostrarMensagem("");

            if (!formularioValido()) return;

            const clienteId = campo("clienteSelecionado").value;
            const clientes = lerJSONLocal(CHAVE_CLIENTES, []);

            const cliente = clientes.find(
                c => String(c.id) === String(clienteId)
            );

            emailDestino.value = cliente?.email || "";

            janelaEmail.hidden = false;
            emailDestino.focus();
        });

        // Cancelar envio
        botaoCancelarEmail.addEventListener("click", () => {
            janelaEmail.hidden = true;
            mostrarMensagem("");
        });

        // Confirmar e enviar
        botaoConfirmarEmail.addEventListener("click", async () => {

            const email = emailDestino.value.trim();

            if (!emailDestino.checkValidity()) {
                emailDestino.reportValidity();
                return;
            }

            botaoConfirmarEmail.disabled = true;
            botaoCancelarEmail.disabled = true;

            mostrarMensagem("A preparar o envio...");

            try {
                await sincronizarGravacoesPendentes();

                if (!await guardarNoHistorico()) return;

                await guardarRascunhoNaNuvem();

                const doc = await gerarPDF(false);

                if (!doc) {
                    throw new Error("Não foi possível gerar o PDF.");
                }

                const numero = campo("numero").value.trim();

                const nomeSeguro = numero.replace(
                    /[^a-zA-Z0-9_-]/g,
                    "_"
                );

                const { data, error } =
                    await supabaseDados.functions.invoke(
                        "enviar-orcamento-email",
                        {
                            body: {
                                to: email,
                                cliente: campo("cliente").value.trim(),
                                numero: numero,
                                pdfBase64: doc.output("datauristring"),
                                fileName: `Orcamento_${nomeSeguro || "novo"}.pdf`
                            }
                        }
                    );

                if (error) throw error;

                if (!data || !data.sucesso) {
                    throw new Error(
                        data?.erro || "Não foi possível enviar o email."
                    );
                }

                janelaEmail.hidden = true;

                mostrarMensagem(
                    "Orçamento enviado por email com sucesso!"
                );

                mostrarHistorico();

            } catch (erro) {
                console.error("Erro ao enviar email:", erro);

                mostrarMensagem(
                    erro.message || "Ocorreu um erro ao enviar o email."
                );

            } finally {
                botaoConfirmarEmail.disabled = false;
                botaoCancelarEmail.disabled = false;
            }
        });

        // CÓPIAS DE SEGURANÇA

        const botaoExportar = campo("exportarBackup");

        if (botaoExportar) {
            botaoExportar.addEventListener(
                "click",
                exportarBackup
            );
        }

        const botaoImportar = campo("importarBackup");
        const ficheiroBackup = campo("ficheiroBackup");

        if (botaoImportar && ficheiroBackup) {
            botaoImportar.addEventListener(
                "click",
                () => ficheiroBackup.click()
            );

            ficheiroBackup.addEventListener(
                "change",
                () => importarBackup(ficheiroBackup.files[0])
            );
        }
    }
    // ==========================================
    // INICIALIZAÇÃO DA APLICAÇÃO
    // ==========================================

    async function iniciarAplicacaoOrcaFacil() {

        if (!form || !linhas || !mensagem) {
            throw new Error(
                "Não foram encontrados todos os elementos do formulário."
            );
        }

        // Carregar sempre os dados da conta atual.
        dadosNuvemCarregados = false;

        await carregarDadosDaNuvem();

        instalarEventos();

        mostrarClientes();
        atualizarSeletorClientes();

        aRestaurarDados = true;

        iniciarDatas();

        const profissional = lerJSONLocal(
            CHAVE_PROFISSIONAL,
            {}
        );

        campo("empresa").value =
            profissional.empresa || "";

        campo("nifEmpresa").value =
            profissional.nifEmpresa || "";

        campo("contacto").value =
            profissional.contacto || "";

        campo("moradaEmpresa").value =
            profissional.moradaEmpresa || "";

        const rascunho = lerJSONLocal(
            CHAVE_RASCUNHO,
            null
        );

        if (rascunho && rascunho.numero) {
            preencherFormulario(rascunho);

        } else {
            campo("cliente").value = "";
            campo("moradaObra").value = "";
            campo("notas").value = "";

            linhas.innerHTML = "";

            adicionarLinha(
                "Trabalhos de pintura",
                1,
                100,
                23
            );

            campo("numero").value = "";

            orcamentoAtualId = null;
        }

        calcular();

        aRestaurarDados = false;

        // Guardar apenas quando o utilizador tem acesso.
        const { data: temAcesso, error: erroAcesso } =
            await window.orcafacilSupabase.rpc("orcafacil_tem_acesso");

        if (erroAcesso) {
            throw erroAcesso;
        }

        if (temAcesso) {
            await guardarDadosProfissionalNaNuvem();
            await guardarRascunhoNaNuvem();
        }
        console.log(
            "OrçaFácil pronto: dados sincronizados com o Supabase."
        );

        mostrarHistorico();

        campo("historicoOrcamentos").hidden = true;
    }
    // ==========================================
    // DISPONIBILIZAR FUNÇÕES AO AUTH.JS
    // ==========================================

    // Inicializar a aplicação
    window.iniciarAplicacaoOrcaFacil =
        iniciarAplicacaoOrcaFacil;

    console.log(
        "Teste: função de inicialização disponível:",
        typeof window.iniciarAplicacaoOrcaFacil
    );

    // Sincronizar os dados antes de terminar sessão
    window.prepararTerminarSessao = async function () {

        exigirNuvem();

        await sincronizarGravacoesPendentes();

        console.log(
            "Dados sincronizados. Pronto para terminar sessão."
        );
    };


    // ==========================================
    // NAVEGAÇÃO DA BARRA LATERAL
    // ==========================================

    function abrirPagina(seccao) {
        const area = document.getElementById("areaTrabalho");
        const conta = document.getElementById("minhaConta");

        if (!area || !conta) return;

        const intro = area.querySelector(".intro");
        const paineis = area.querySelectorAll(":scope > .painel");
        const historico = document.getElementById("historicoOrcamentos");
        const clientes = document.getElementById("gestaoClientes");
        const formulario = document.getElementById("formOrcamento");
        const aviso = area.querySelector(".aviso");

        // Esconder todas as áreas
        area.hidden = false;
        conta.hidden = true;

        if (intro) intro.hidden = true;
        paineis.forEach(painel => painel.hidden = true);
        if (historico) historico.hidden = true;
        if (clientes) clientes.hidden = true;
        if (formulario) formulario.hidden = true;
        if (aviso) aviso.hidden = true;

        // Mostrar apenas a área selecionada
        switch (seccao) {
            case "painel":
                if (intro) intro.hidden = false;
                if (paineis.length > 0) paineis[0].hidden = false;
                break;

            case "orcamentos":
                if (formulario) formulario.hidden = false;
                if (aviso) aviso.hidden = false;
                break;

            case "clientes":
                if (clientes) clientes.hidden = false;
                if (typeof mostrarClientes === "function") {
                    mostrarClientes();
                }
                break;

            case "historico":
                if (historico) historico.hidden = false;
                if (typeof mostrarHistorico === "function") {
                    mostrarHistorico();
                }
                break;

            case "conta":
                area.hidden = true;
                conta.hidden = false;
                break;
        }
    }

    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", function (event) {
            event.preventDefault();

            document.querySelectorAll(".nav-item").forEach(link => {
                link.classList.remove("ativo");
            });

            this.classList.add("ativo");
            abrirPagina(this.dataset.seccao);
        });
    });

    // Abrir o painel inicial por defeito
    abrirPagina("painel");


    // Fim da aplicação
})();
