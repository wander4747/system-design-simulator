import { isCacheLike } from './types.js';

const fmt = (value) => Math.round(value).toLocaleString('pt-BR');

function remedyFor(node) {
  if (node.type === 'db') return 'Coloque um cache na frente (leituras) ou use réplicas de leitura.';
  if (node.type === 'server') return 'Adicione mais servidores atrás de um Load Balancer ou aumente a capacidade.';
  return 'Aumente a capacidade ou distribua a carga.';
}

/**
 * Explains what is wrong with a node and what to do about it.
 * Returns user-facing text (Portuguese), or null when the node is healthy.
 */
export function diagnoseNode(node, runtime) {
  if (runtime.status === 'down') {
    return isCacheLike(node)
      ? `${node.name} caiu: todo o tráfego agora vai direto para a origem (risco de avalanche no banco).`
      : `${node.name} está fora do ar. Sem redundância atrás de um Load Balancer, isso é um ponto único de falha (SPOF).`;
  }
  if (runtime.status === 'ok') return null;

  if (node.type === 'queue') {
    return runtime.status === 'bad'
      ? `${node.name} encheu (${fmt(runtime.backlog)} msgs) e está descartando mensagens. Aumente o consumo (drain) ou adicione workers.`
      : `${node.name} acumulando ${fmt(runtime.backlog)} msgs: consumidores não acompanham a entrada.`;
  }

  const { capacity } = node.cfg;
  const remedy = remedyFor(node);
  if (runtime.status === 'bad') {
    const droppedPct = runtime.incoming > 0 ? Math.round((runtime.dropped / runtime.incoming) * 100) : 0;
    const loss = droppedPct > 0 ? `fila cheia, ${droppedPct}% descartado` : 'fila crescendo';
    return `${node.name} recebe ${fmt(runtime.incoming)} rps mas aguenta ${fmt(capacity)}: ${loss}, espera de ${fmt(runtime.waitMs)} ms. ${remedy}`;
  }
  return `${node.name} a ${Math.round(runtime.load * 100)}% da capacidade (${fmt(runtime.incoming)}/${fmt(capacity)} rps): latência subindo. ${remedy}`;
}
