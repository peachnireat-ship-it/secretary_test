let _pendingStatus = null;

export function setPendingLibraryStatus(status) {
  _pendingStatus = status;
}

export function takePendingLibraryStatus() {
  const s = _pendingStatus;
  _pendingStatus = null;
  return s;
}
