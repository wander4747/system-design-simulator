# Melhorias futuras

## CPU e RAM nos servidores

Hoje a capacidade do servidor é um número digitado (`capacity`, em rps). A ideia é derivá-la de recursos da máquina e ganhar novos modos de falha.

**Etapa 1: CPU**

- Seletor de tipo de instância (pequena 1 vCPU/2 GB, média 2/4, grande 4/16…) que preenche CPU e RAM.
- Capacidade por CPU: `vCPU × 1000 / ms de CPU por requisição`.
- Campos avançados (ms de CPU por requisição, MB por requisição) escondidos por padrão.
- Capacidade manual continua disponível como alternativa.

**Etapa 2: RAM**

- Concorrência pela lei de Little: `requisições simultâneas = rps × latência`; cada uma ocupa memória.
- Estouro de RAM causa OOM: o servidor cai e reinicia sozinho após alguns segundos (novo estado "reiniciando").
- O LB redistribui a carga e os outros servidores podem estourar em cascata.
- `capacity` passa a ser `min(limite por CPU, limite por RAM)`.
- Diagnóstico indica qual recurso estourou (ex.: "API 1 sem RAM: 480 conexões simultâneas, aguenta 300").

**Fora do escopo inicial:** banco de dados, onde a RAM age como cache de buffer e influencia o hit rate.

## Foco em entrevista de system design

Priorizado pelo que mais aparece em entrevista e pelo que mais se beneficia de um simulador (falhas difíceis de imaginar só no papel).

**Alta prioridade**

1. **Retry storm e circuit breaker.** Clientes que tentam de novo multiplicam a carga no sistema que já está caindo; o breaker corta isso. Ótimo para a pergunta "e se o serviço X cair?".
2. **Réplicas de leitura e sharding no banco.** Leitura espalhada nas réplicas, escrita presa no primário, e shard quente (um shard com 80% do tráfego e os outros ociosos).
3. **Rate limiter (token bucket).** Protege o sistema no pico e mostra o trade-off: derruba pedidos de propósito para o resto sobreviver.
4. **Estimativa de capacidade (back-of-envelope).** Calculadora usuários → QPS → storage → banda que preenche a carga do simulador (ex.: "10M usuários/dia, 100 bytes por registro").

**Média prioridade** 5. **Cache stampede (thundering herd).** TTL e expiração do cache; ao expirar ou cair, todos os pedidos batem no banco ao mesmo tempo (hoje só dá para derrubar o cache). 6. **Zonas de disponibilidade.** Agrupar nós em AZ-A e AZ-B e derrubar a AZ inteira. 7. **Proporção leitura/escrita.** Controle "90% leitura, 10% escrita" que define o que o cache absorve e o que vai ao banco. 8. **SLO e error budget.** Definir "99,9% de sucesso, p99 abaixo de 300 ms" e avisar quando o orçamento estoura.

**Mais didático do que simulável**

- CAP e consistência (réplica atrasada devolvendo dado velho, como lag de replicação).
- Consistent hashing (efeito de adicionar ou remover um nó do cache).

**Ordem sugerida:** começar por circuit breaker + retry storm e por réplicas + shard quente; a calculadora de estimativa é barata e vem como segunda entrega.

## Diferenciais (o que destaca o simulador)

1. **Modo desafio com custo.** Objetivo do tipo "aguente 10 mil usuários com 99,9% de sucesso gastando no máximo R$ X". O app pontua e mostra onde dava para gastar menos. Requer preço por hora em cada componente (mostrado ao vivo como custo mensal da arquitetura) e uma regra de pontuação; o motor já fornece capacidade, sucesso e latência. **Recomendado como primeira escolha.**
2. **Replay do incidente.** Ao quebrar, linha do tempo de causa e efeito, estilo postmortem: "cache caiu → banco saturou → fila da API encheu → usuários viram erro".
3. **Pergunta do entrevistador.** Cenários prontos ("e se a região cair?", "o tráfego triplica na Black Friday?") que você resolve ajustando o diagrama. Entrevistador simulado, sem IA.
4. **Comparar duas arquiteturas lado a lado.** Mesmo pico nas duas, mostrando qual quebra primeiro e por quê (ex.: com cache vs sem cache).
5. **Compartilhar por link.** Diagrama inteiro serializado na URL, sem servidor (validar com `normalizeGraph` ao abrir).

## Salvar, exportar e importar diagramas

O salvamento automático foi removido para o app abrir sempre vazio, então hoje recarregar a página perde o diagrama.

- **Salvar no navegador:** botão explícito, com nome, e lista dos diagramas salvos para abrir ou apagar. O app continua abrindo vazio.
- **Exportar:** baixar o diagrama como arquivo `.json`.
- **Importar:** abrir um `.json` exportado. Passa pelo `normalizeGraph` (limites de nós e valores, tipos válidos, sem ciclos), então arquivo adulterado não quebra o app. Limitar também o tamanho do arquivo antes de ler.
- **Compartilhar por link:** ver "Diferenciais".

## Outras ideias

- Autoscaling de servidores.
- Cenários prontos (estilo Uber, Twitter).
