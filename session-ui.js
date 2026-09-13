(() => {
  window.createPouchCorrectionUI = ({ panel, dialog, closeDialog, request, getState, picked, esc, error }) => {
    const footer = panel.querySelector(".cp-footer");
    let draft = null;
    const action = document.createElement("button");
    action.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6m0 3 3 3 6-6"/></svg>';
    action.className = "cp-action-icon cp-session-action";
    action.title = "Correct running session";
    action.setAttribute("aria-label", "Correct running session");
    footer.prepend(action);
    const status = document.createElement("div");
    status.className = "cp-wide";
    status.setAttribute("role", "status");
    footer.append(status);
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel queued correction";
    cancel.className = "cp-wide";
    cancel.hidden = true;
    footer.append(cancel);
    const refresh = () => {
      const session = window.__contextPouchSession;
      const state = session?.status();
      status.textContent = state?.message || "";
      cancel.hidden = !state?.queued;
      action.disabled = Boolean(state?.sending || state?.queued);
    };
    cancel.onclick = () => { window.__contextPouchSession?.cancel(); refresh(); };
    window.addEventListener("context-pouch-session", refresh);
    action.onclick = () => {
      const session = window.__contextPouchSession;
      if (!session) return error("Session correction is unavailable in this Codex build. Run Install / Repair and reload; draft insertion remains available.");
      const review = session.snapshot();
      if (!review) return error("Open one conversation with a running turn, then try again.");
      const state = getState();
      if (!state) return error("Wait for the rule library to connect.");
      if (state.activeConflicts.length) return error("Selected rules have confirmed conflicts. Deselect one side before correcting.");
      const revision = state.revision;
      const rules = window.ContextPouchModel.payload(picked(), "reinforce");
      const text = draft?.target === review.target && draft.revision === revision ? draft.text
        : `Reconsider the current implementation against these instructions. Correct any conflicting changes already made, then continue any remaining work on the original task.\n\n${rules}`;
      dialog(`<strong>Correct running session</strong><p>Conversation: ${esc(review.title)}</p><label><span>Correction (include the existing component or file when useful)</span><textarea class="cp-correction-text">${esc(text)}</textarea></label><label><span>When to apply</span><select class="cp-correction-mode"><option value="now">Apply now — steer the running turn</option><option value="after">After this turn — queue a correction</option><option value="stop">Stop and correct — interrupt, then continue</option></select></label><p>Apply now does not immediately stop an executing operation. Queued corrections are cancelled if you leave this conversation or reload.</p><div class="cp-actions"><button class="cp-primary cp-send-correction">Send correction</button><button data-action="cancel">Back</button></div><div class="cp-correction-confirmation" hidden role="group" aria-label="Confirm session correction"><p class="cp-confirm-message"></p><div class="cp-actions"><button class="cp-primary cp-confirm-correction">Confirm</button><button class="cp-cancel-correction">Cancel</button></div></div>`);
      const send = panel.querySelector(".cp-send-correction");
      const confirmation = panel.querySelector(".cp-correction-confirmation");
      const confirm = panel.querySelector(".cp-confirm-correction");
      const textInput = panel.querySelector(".cp-correction-text");
      const modeInput = panel.querySelector(".cp-correction-mode");
      let pending = null;
      send.onclick = () => {
        if (pending) return;
        const text = textInput.value.trim(), mode = modeInput.value;
        if (!text) return error("Enter a correction before sending.");
        pending = { text, mode };
        draft = { target: review.target, revision, text };
        const description = mode === "after" ? "Queue this correction for after the current turn"
          : mode === "stop" ? "Stop the running turn and send this correction"
          : "Send this correction to the running turn";
        panel.querySelector(".cp-confirm-message").textContent = `${description} in “${review.title}”?`;
        confirmation.hidden = false;
        send.disabled = textInput.disabled = modeInput.disabled = true;
        confirm.focus();
      };
      const resetConfirmation = () => {
        pending = null;
        confirmation.hidden = true;
        send.disabled = textInput.disabled = modeInput.disabled = false;
        send.focus();
      };
      const cancelConfirmation = panel.querySelector(".cp-cancel-correction");
      cancelConfirmation.onclick = () => { if (!confirm.disabled) resetConfirmation(); };
      confirm.onclick = async () => {
        if (!pending || confirm.disabled) return;
        const { text, mode } = pending;
        confirm.disabled = cancelConfirmation.disabled = true;
        try {
          await request("state");
          if (getState().revision !== revision) throw new Error("Your project or rules changed. Review the correction again.");
          await session.deliver(review, mode, text);
          if (panel.querySelector(".cp-send-correction") === send) closeDialog();
        } catch (e) { error(e.message); }
        finally { confirm.disabled = cancelConfirmation.disabled = false; resetConfirmation(); refresh(); }
      };
    };
    refresh();
  };
})();
