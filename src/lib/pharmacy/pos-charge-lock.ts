/**
 * Synchronous Charge lock. React setState is too late to stop a double-click
 * from minting two sale_numbers and two SQLite deductions.
 */

export type ChargeLockState = {
  locked: boolean;
  saleNumber: string | null;
};

export function createChargeLockState(): ChargeLockState {
  return { locked: false, saleNumber: null };
}

export function beginCharge(
  state: ChargeLockState,
  mintSaleNumber: () => string
): { ok: true; saleNumber: string } | { ok: false } {
  if (state.locked) return { ok: false };
  state.locked = true;
  if (!state.saleNumber) state.saleNumber = mintSaleNumber();
  return { ok: true, saleNumber: state.saleNumber };
}

export function endCharge(state: ChargeLockState, committed: boolean): void {
  state.locked = false;
  if (committed) state.saleNumber = null;
}
