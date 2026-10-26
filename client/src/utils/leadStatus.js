// Keep the stored status compatible with existing leads, API filters, and metrics.
export function leadStatusLabel(status) {
  return status === 'Not Responding' ? 'Not Reachable' : status;
}
