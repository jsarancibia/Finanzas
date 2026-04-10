export async function runApp({ getAuthHeaders, authUserId }) {
        if (!authUserId || typeof authUserId !== "string") {
          throw new Error("authUserId requerido para el chat por usuario.");
        }
        const CHAT_SESSION_STORAGE_KEY = "finanzas_chat_session_id_" + authUserId.trim();
        const logEl = document.getElementById("log");
        const form = document.getElementById("form");
        const input = document.getElementById("input");
        const sendBtn = document.getElementById("send");
        const btnClearChat = document.getElementById("btn-clear-chat");
        const resumenList = document.getElementById("resumen-list");
        const resumenTotales = document.getElementById("resumen-totales");
        const resumenStatus = document.getElementById("resumen-status");
    async function authFetch(input, init = {}) {
      const auth = await getAuthHeaders();
      const headers = new Headers(init.headers || undefined);
      if (auth && auth.Authorization) headers.set("Authorization", auth.Authorization);
      return fetch(input, { ...init, headers });
    }

        function newSessionUuid() {
          if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
          }
          const b = new Uint8Array(16);
          if (typeof crypto !== "undefined" && crypto.getRandomValues) {
            crypto.getRandomValues(b);
          } else {
            for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
          }
          b[6] = (b[6] & 0x0f) | 0x40;
          b[8] = (b[8] & 0x3f) | 0x80;
          const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
          return (
            h.slice(0, 8) +
            "-" +
            h.slice(8, 12) +
            "-" +
            h.slice(12, 16) +
            "-" +
            h.slice(16, 20) +
            "-" +
            h.slice(20, 32)
          );
        }

        function getOrCreateSessionId() {
          try {
            let id = localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
            if (id && typeof id === "string") id = id.trim();
            if (id && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
              return id;
            }
            const nu = newSessionUuid();
            localStorage.setItem(CHAT_SESSION_STORAGE_KEY, nu);
            return nu;
          } catch {
            return newSessionUuid();
          }
        }

        async function cargarHistorialDesdeServidor() {
          const sid = getOrCreateSessionId();
          try {
            const res = await authFetch(
              "/api/chat-history?session_id=" + encodeURIComponent(sid),
              { cache: "no-store" },
            );
            const ct = res.headers.get("content-type") || "";
            const data = ct.includes("application/json") ? await res.json() : null;
            if (!res.ok) {
              throw new Error((data && data.error) || "Error " + res.status);
            }
            const arr = data && Array.isArray(data.messages) ? data.messages : [];
            for (const m of arr) {
              if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
              const t = typeof m.message === "string" ? m.message : "";
              if (!t) continue;
              appendBubble(m.role, t, { warn: false });
            }
          } catch {
            appendSystem(
              "No se pudo cargar el historial guardado. El chat sigue funcionando.",
            );
          }
        }

        function formatMonto(n, moneda) {
          const x = Math.round(Number(n));
          if (!Number.isFinite(x)) return String(n);
          const m = (moneda || "CLP").trim().toUpperCase();
          if (m === "CLP") {
            return "$" + x.toLocaleString("es-CL", { maximumFractionDigits: 0 });
          }
          return x.toLocaleString("es-CL", { maximumFractionDigits: 0 }) + " " + m;
        }

        function formatFechaCorta(iso) {
          if (!iso || typeof iso !== "string") return "";
          try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return "";
            return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
          } catch {
            return "";
          }
        }

        function elFinCard(nombre, bancoLine, montoStr, variant, fechaStr) {
          const card = document.createElement("article");
          card.className = "fin-card fin-card--" + variant;
          const tit = document.createElement("h3");
          tit.className = "fin-card__nombre";
          tit.textContent = nombre || "\u2014";
          card.appendChild(tit);
          if (bancoLine) {
            const meta = document.createElement("p");
            meta.className = "fin-card__meta";
            meta.textContent = bancoLine;
            card.appendChild(meta);
          }
          const mon = document.createElement("p");
          mon.className = "fin-card__monto";
          mon.textContent = montoStr;
          card.appendChild(mon);
          if (fechaStr) {
            const fe = document.createElement("p");
            fe.className = "fin-card__fecha";
            fe.textContent = fechaStr;
            card.appendChild(fe);
          }
          return card;
        }

        function filaTotalIntro(label, montoFormateado) {
          const row = document.createElement("div");
          row.className = "sidebar-totales__row";
          const lab = document.createElement("span");
          lab.className = "sidebar-totales__label";
          lab.textContent = label;
          const val = document.createElement("span");
          val.className = "sidebar-totales__value";
          val.textContent = montoFormateado;
          row.appendChild(lab);
          row.appendChild(val);
          return row;
        }

        function pintarTotalesIntro(data, moneda) {
          if (!resumenTotales) return;
          resumenTotales.replaceChildren();
          const ahr =
            data.saldo_ahorrado_total != null && typeof data.saldo_ahorrado_total === "number"
              ? data.saldo_ahorrado_total
              : 0;
          const pend =
            data.dinero_pendiente_repartir != null && typeof data.dinero_pendiente_repartir === "number"
              ? data.dinero_pendiente_repartir
              : 0;
          resumenTotales.appendChild(
            filaTotalIntro("Disponible", formatMonto(data.saldo_disponible, moneda)),
          );
          if (pend > 0) {
            resumenTotales.appendChild(
              filaTotalIntro("Pendiente de repartir", formatMonto(pend, moneda)),
            );
          }
          resumenTotales.appendChild(filaTotalIntro("Ahorro", formatMonto(ahr, moneda)));
        }

        function seccionDashboard(titulo, totalStr) {
          const sec = document.createElement("section");
          sec.className = "dash-section";
          const head = document.createElement("div");
          head.className = "dash-section__head";
          const h = document.createElement("h3");
          h.className = "dash-section__title";
          h.textContent = titulo;
          head.appendChild(h);
          if (totalStr) {
            const t = document.createElement("p");
            t.className = "dash-section__total";
            t.textContent = totalStr;
            head.appendChild(t);
          }
          sec.appendChild(head);
          const cards = document.createElement("div");
          cards.className = "dash-section__cards";
          sec.appendChild(cards);
          return { sec, cards };
        }

        async function refreshResumen() {
          resumenStatus.textContent = "Actualizando\u2026";
          resumenStatus.classList.remove("error");
          try {
            const res = await authFetch("/api/resumen-cuentas", { cache: "no-store" });
            const ct = res.headers.get("content-type") || "";
            const data = ct.includes("application/json") ? await res.json() : null;
            if (!res.ok) {
              throw new Error((data && data.error) || "Error " + res.status);
            }
            if (!data || typeof data.saldo_disponible !== "number") {
              throw new Error("Respuesta inv\u00e1lida");
            }

            resumenList.replaceChildren();
            resumenStatus.textContent = "";

            const moneda = data.moneda || "CLP";
            pintarTotalesIntro(data, moneda);
            const disp = Array.isArray(data.seccion_disponible) ? data.seccion_disponible : [];
            const ahr = Array.isArray(data.seccion_ahorro) ? data.seccion_ahorro : [];
            const gUlt = Array.isArray(data.gastos_ultimos) ? data.gastos_ultimos : [];
            const gCat = Array.isArray(data.gastos_por_categoria) ? data.gastos_por_categoria : [];
            const pend =
              data.dinero_pendiente_repartir != null && typeof data.dinero_pendiente_repartir === "number"
                ? data.dinero_pendiente_repartir
                : 0;

            const sPend = seccionDashboard(
              "Pendiente de repartir",
              pend > 0 ? formatMonto(pend, moneda) : "",
            );
            resumenList.appendChild(sPend.sec);
            if (pend > 0) {
              sPend.cards.appendChild(
                elFinCard(
                  "Por asignar a una cuenta",
                  "Ingresos sin cuenta o saldo a\u00fan no repartido",
                  formatMonto(pend, moneda),
                  "pendiente",
                  "",
                ),
              );
            } else {
              const emptyP = document.createElement("div");
              emptyP.className = "empty-state";
              emptyP.textContent =
                "No hay dinero pendiente: todo el disponible est\u00e1 en cuentas o el saldo es cero.";
              sPend.cards.appendChild(emptyP);
            }

            const s1 = seccionDashboard(
              "Dinero disponible",
              "Total " + formatMonto(data.saldo_disponible, moneda),
            );
            resumenList.appendChild(s1.sec);
            if (disp.length === 0) {
              const empty = document.createElement("div");
              empty.className = "empty-state";
              empty.textContent =
                pend > 0
                  ? "A\u00fan no hay cuentas con saldo. Usa el chat para asignar desde \u00abdisponible sin cuenta\u00bb (ej. a Cuenta RUT o Mercado Pago)."
                  : "Sin cuentas disponibles con saldo en la base de datos.";
              s1.cards.appendChild(empty);
            } else {
              for (const c of disp) {
                if (!c) continue;
                const banco = c.banco && String(c.banco).trim() ? String(c.banco).trim() : null;
                s1.cards.appendChild(
                  elFinCard(String(c.nombre || "\u2014"), banco, formatMonto(c.monto, moneda), "disponible", ""),
                );
              }
            }

            const s2 = seccionDashboard(
              "Ahorro",
              "Total " + formatMonto(data.saldo_ahorrado_total, moneda),
            );
            resumenList.appendChild(s2.sec);
            if (ahr.length === 0) {
              const empty = document.createElement("div");
              empty.className = "empty-state";
              empty.textContent = "Sin ahorros registrados en cuentas.";
              s2.cards.appendChild(empty);
            } else {
              for (const c of ahr) {
                if (!c) continue;
                const banco = c.banco && String(c.banco).trim() ? String(c.banco).trim() : null;
                s2.cards.appendChild(
                  elFinCard(String(c.nombre || "\u2014"), banco, formatMonto(c.monto, moneda), "ahorro", ""),
                );
              }
            }

            let sumaUltimos = 0;
            for (const g of gUlt) {
              if (!g) continue;
              const v = Math.round(Number(g.monto));
              if (Number.isFinite(v) && v > 0) sumaUltimos += v;
            }
            let sumaCategorias = 0;
            for (const row of gCat) {
              if (!row) continue;
              const v = Math.round(Number(row.monto));
              if (Number.isFinite(v) && v > 0) sumaCategorias += v;
            }
            const partesGastos = [];
            if (sumaUltimos > 0) partesGastos.push("\u00daltimos " + formatMonto(sumaUltimos, moneda));
            if (sumaCategorias > 0) partesGastos.push("Por categor\u00eda " + formatMonto(sumaCategorias, moneda));
            const totalGastosStr = partesGastos.length > 0 ? partesGastos.join(" \u00b7 ") : "";

            const s3 = seccionDashboard("Gastos", totalGastosStr);
            resumenList.appendChild(s3.sec);
            const subUlt = document.createElement("h4");
            subUlt.className = "dash-section__subtitle";
            subUlt.textContent = "\u00daltimos gastos";
            s3.cards.appendChild(subUlt);
            if (gUlt.length === 0) {
              const empty = document.createElement("div");
              empty.className = "empty-state";
              empty.style.padding = "0.5rem 0";
              empty.textContent = "A\u00fan no hay gastos recientes.";
              s3.cards.appendChild(empty);
            } else {
              for (const g of gUlt) {
                if (!g) continue;
                const fe = formatFechaCorta(g.fecha);
                s3.cards.appendChild(
                  elFinCard(
                    String(g.etiqueta || "Gasto"),
                    null,
                    formatMonto(g.monto, moneda),
                    "gasto",
                    fe,
                  ),
                );
              }
            }
            const subCat = document.createElement("h4");
            subCat.className = "dash-section__subtitle";
            subCat.style.marginTop = "0.65rem";
            subCat.textContent = "Por categor\u00eda";
            s3.cards.appendChild(subCat);
            if (gCat.length === 0) {
              const empty = document.createElement("div");
              empty.className = "empty-state";
              empty.style.padding = "0.5rem 0";
              empty.textContent = "Sin datos por categor\u00eda.";
              s3.cards.appendChild(empty);
            } else {
              for (const row of gCat) {
                if (!row) continue;
                s3.cards.appendChild(
                  elFinCard(
                    String(row.categoria || "\u2014"),
                    null,
                    formatMonto(row.monto, moneda),
                    "gasto",
                    "",
                  ),
                );
              }
            }
          } catch (err) {
            if (resumenTotales) resumenTotales.replaceChildren();
            resumenStatus.textContent =
              err instanceof Error ? err.message : String(err);
            resumenStatus.classList.add("error");
          }
        }

        function scrollToBottom() {
          logEl.scrollTop = logEl.scrollHeight;
        }

        function appendBubble(role, text, opts) {
          const div = document.createElement("div");
          div.className = "msg " + role + (opts && opts.warn ? " warn" : "");
          div.textContent = text;
          logEl.appendChild(div);
          requestAnimationFrame(scrollToBottom);
        }

        function appendSystem(text) {
          const div = document.createElement("div");
          div.className = "msg system";
          div.textContent = text;
          logEl.appendChild(div);
          requestAnimationFrame(scrollToBottom);
        }

        function showTyping() {
          const div = document.createElement("div");
          div.className = "msg assistant typing";
          div.setAttribute("aria-busy", "true");
          div.textContent = "Escribiendo\u2026";
          logEl.appendChild(div);
          requestAnimationFrame(scrollToBottom);
          return div;
        }

        function removeTyping(el) {
          if (el && el.parentNode === logEl) {
            logEl.removeChild(el);
          }
        }

        async function sendMessage(text) {
          const res = await authFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, sessionId: getOrCreateSessionId() }),
          });

          const ct = res.headers.get("content-type") || "";
          let body;
          try {
            body = ct.includes("application/json") ? await res.json() : { raw: await res.text() };
          } catch {
            throw new Error("Respuesta no legible del servidor.");
          }

          if (!res.ok) {
            const err =
              body && typeof body.error === "string"
                ? body.error
                : "Error HTTP " + res.status;
            throw new Error(err);
          }

          if (!body || typeof body.texto !== "string") {
            throw new Error("Formato de respuesta inesperado.");
          }

          return body;
        }

        form.addEventListener("submit", async function (e) {
          e.preventDefault();
          const text = input.value.trim();
          if (!text) return;

          appendBubble("user", text);
          input.value = "";
          input.style.height = "auto";

          sendBtn.disabled = true;
          input.disabled = true;

          const typingEl = showTyping();

          try {
            const data = await sendMessage(text);
            removeTyping(typingEl);
            appendBubble("assistant", data.texto, { warn: !data.resultado || !data.resultado.ok });
            void refreshResumen();
          } catch (err) {
            removeTyping(typingEl);
            appendBubble(
              "assistant",
              err instanceof Error ? err.message : String(err),
              { warn: true },
            );
          } finally {
            sendBtn.disabled = false;
            input.disabled = false;
            input.focus();
            requestAnimationFrame(scrollToBottom);
          }
        });

        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
          }
        });

        input.addEventListener("input", function () {
          input.style.height = "auto";
          input.style.height = Math.min(input.scrollHeight, 128) + "px";
        });

        if (btnClearChat) {
          btnClearChat.addEventListener("click", async function () {
            if (
              !confirm(
                "Â¿Quieres limpiar solo el chat visible? No se borran movimientos ni saldos.",
              )
            ) {
              return;
            }
            const sid = getOrCreateSessionId();
            try {
              const res = await authFetch("/api/chat-clear", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sid }),
              });
              const ct = res.headers.get("content-type") || "";
              const data = ct.includes("application/json") ? await res.json() : null;
              if (!res.ok) {
                throw new Error((data && data.error) || "Error " + res.status);
              }
              logEl.replaceChildren();
              appendSystem("Chat limpiado. Escribe un mensaje para comenzar de nuevo.");
            } catch (err) {
              appendSystem(
                err instanceof Error ? err.message : String(err),
              );
            }
          });
        }

        async function inicializarChatUI() {
          await cargarHistorialDesdeServidor();
          if (logEl.children.length === 0) {
            appendSystem("Empieza registrando un ingreso (ej: recibí mi sueldo 560.000). Luego puedes distribuirlo entre tus cuentas y registrar gastos.");
          }
          input.focus();
          void refreshResumen();
        }

        await inicializarChatUI();
}

