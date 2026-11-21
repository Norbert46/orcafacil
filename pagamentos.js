
"use strict";

// ==========================================
// ORÇAFÁCIL - PAGAMENTOS STRIPE
// ==========================================

// ==========================================
// FORMATAR DATAS
// ==========================================

function formatarDataSubscricao(data) {
    if (!data) return "";

    return new Date(data).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

// ==========================================
// CARREGAR ESTADO DA SUBSCRIÇÃO
// ==========================================



async function carregarEstadoSubscricao() {

    const supabase = window.orcafacilSupabase;

    const estadoElemento =
        document.getElementById("estadoSubscricao");

    const fimTrialElemento =
        document.getElementById("fimTrial");

    const botaoAderir =
        document.getElementById("aderirSubscricao");

    if (!estadoElemento) {
        console.error("Elemento estadoSubscricao não encontrado.");
        return;
    }

    if (!supabase) {
        estadoElemento.textContent =
            "Não foi possível ligar ao servidor.";
        return;
    }

    // Estado inicial
    estadoElemento.textContent = "A carregar...";

    if (fimTrialElemento) {
        fimTrialElemento.textContent = "";
    }

    try {

        const { data, error } = await supabase
            .from("orcafacil_subscricoes")
            .select(`
                estado,
                trial_fim,
                periodo_pago_ate,
                cancelamento_agendado
            `)
            .maybeSingle();

        if (error) throw error;

        if (!data) {

            estadoElemento.textContent = "Sem subscrição";

            if (fimTrialElemento) {
                fimTrialElemento.textContent =
                    "Ainda não existe uma subscrição associada a esta conta.";
            }

            if (botaoAderir) {
                botaoAderir.textContent = "Aderir ao OrçaFácil";
            }

            return;
        }

        console.log("Subscrição carregada:", data);

        const agora = new Date();

        const dataFimTrial = data.trial_fim
            ? new Date(data.trial_fim)
            : null;

        const dataFimPago = data.periodo_pago_ate
            ? new Date(data.periodo_pago_ate)
            : null;

        const temTrial =
            dataFimTrial && dataFimTrial > agora;

        const temPeriodoPago =
            dataFimPago && dataFimPago > agora;

        const trialTerminado =
            dataFimTrial && dataFimTrial <= agora;

        const periodoPagoTerminado =
            dataFimPago && dataFimPago <= agora;

        const formatarFimTrial =
            formatarDataSubscricao(data.trial_fim);

        const formatarFimPago =
            formatarDataSubscricao(data.periodo_pago_ate);

        // ======================================
        // TRIALING
        // ======================================

        if (data.estado === "trialing") {

            if (!temTrial) {

                estadoElemento.textContent =
                    "Necessita de renovar subscrição";

                if (fimTrialElemento) {
                    fimTrialElemento.textContent =
                        "O período experimental terminou. " +
                        "Gere a tua subscrição para recuperar o acesso.";
                }

                if (botaoAderir) {
                    botaoAderir.textContent = "Renovar subscrição";
                }

                return;
            }

            if (data.cancelamento_agendado) {

                estadoElemento.textContent =
                    "Cancelamento agendado";

                if (fimTrialElemento) {
                    fimTrialElemento.textContent =
                        "O período experimental termina em " +
                        formatarFimTrial +
                        ". Não será efetuada a cobrança mensal.";
                }

            } else {

                estadoElemento.textContent =
                    "Período experimental";

                if (fimTrialElemento) {
                    fimTrialElemento.textContent =
                        "O período gratuito termina em " +
                        formatarFimTrial +
                        ". Depois, a subscrição será de 9,90 €/mês.";
                }
            }

            if (botaoAderir) {
                botaoAderir.textContent = "Gerir subscrição";
            }

            return;
        }

        // ======================================
        // ACTIVE
        // ======================================

        if (data.estado === "active") {

            if (!temPeriodoPago) {

                estadoElemento.textContent =
                    "Necessita de renovar subscrição";

                if (fimTrialElemento) {
                    fimTrialElemento.textContent =
                        "O período pago terminou. " +
                        "Gere a tua subscrição para recuperar o acesso.";
                }

                if (botaoAderir) {
                    botaoAderir.textContent = "Renovar subscrição";
                }

                return;
            }

            if (data.cancelamento_agendado) {

                estadoElemento.textContent =
                    "Cancelamento agendado";

                if (fimTrialElemento) {
                    fimTrialElemento.textContent =
                        "A tua subscrição mantém-se ativa até " +
                        formatarFimPago +
                        ". Após essa data, terás de efetuar uma nova renovação para continuar a utilizar o OrçaFácil.";
                }

            } else {

                estadoElemento.textContent =
                    "Subscrição ativa";

                if (fimTrialElemento) {
                    fimTrialElemento.textContent =
                        "Próxima renovação: " +
                        formatarFimPago +
                        ". Preço: 9,90 €/mês.";
                }
            }

            if (botaoAderir) {
                botaoAderir.textContent = "Gerir subscrição";
            }

            return;
        }

        // ======================================
        // PAST DUE
        // ======================================

        if (data.estado === "past_due") {

            estadoElemento.textContent =
                "Pagamento pendente";

            if (fimTrialElemento) {
                fimTrialElemento.textContent =
                    "Verifica os dados do teu método de pagamento " +
                    "no Portal de Gestão do Stripe.";
            }

            if (botaoAderir) {
                botaoAderir.textContent = "Gerir subscrição";
            }

            return;
        }

        // ======================================
        // CANCELED / EXPIRED
        // ======================================

        if (
            data.estado === "canceled" ||
            data.estado === "expired"
        ) {

            estadoElemento.textContent =
                "Necessita de renovar subscrição";

            if (fimTrialElemento) {
                fimTrialElemento.textContent =
                    "A tua subscrição terminou. " +
                    "Gere uma nova subscrição para recuperar o acesso.";
            }

            if (botaoAderir) {
                botaoAderir.textContent = "Renovar subscrição";
            }

            return;
        }

        // ======================================
        // ESTADO DESCONHECIDO
        // ======================================

        estadoElemento.textContent =
            data.estado || "Estado desconhecido";

        if (fimTrialElemento) {
            fimTrialElemento.textContent = "";
        }

        if (botaoAderir) {
            botaoAderir.textContent = "Gerir subscrição";
        }

    } catch (erro) {

        console.error(
            "Erro ao carregar subscrição:",
            erro
        );

        estadoElemento.textContent =
            "Não foi possível consultar a subscrição.";

        if (fimTrialElemento) {
            fimTrialElemento.textContent = "";
        }
    }
}

// ==========================================
// INICIAR PAGAMENTO OU PORTAL STRIPE
// ==========================================

async function iniciarPagamentoStripe() {

    const supabase = window.orcafacilSupabase;

    if (!supabase) {
        alert("Não foi possível ligar ao servidor.");
        return;
    }

    try {

        const { data: subscricao, error: erroSubscricao } =
            await supabase
                .from("orcafacil_subscricoes")
                .select("stripe_customer_id")
                .maybeSingle();

        if (erroSubscricao) {
            throw erroSubscricao;
        }

        let funcao;

        if (subscricao?.stripe_customer_id) {

            // Cliente existente: abrir o portal de gestão
            funcao = "create-portal-session";

        } else {

            // Sem cliente Stripe: iniciar o Checkout
            funcao = "create-checkout-session";
        }

        const { data, error } =
            await supabase.functions.invoke(
                funcao,
                { body: {} }
            );

        if (error) throw error;

        if (!data || !data.url) {
            throw new Error(
                "O Stripe não devolveu um endereço válido."
            );
        }

        window.location.href = data.url;

    } catch (erro) {

        console.error(
            "Erro ao abrir o Stripe:",
            erro
        );

        alert(
            "Não foi possível abrir a gestão da subscrição. " +
            "Tenta novamente."
        );
    }
}


// ==========================================
// DISPONIBILIZAR FUNÇÕES
// ==========================================

window.carregarEstadoSubscricao =
    carregarEstadoSubscricao;

window.iniciarPagamentoStripe =
    iniciarPagamentoStripe;
