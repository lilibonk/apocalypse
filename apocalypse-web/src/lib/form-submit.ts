import { toast } from 'sonner'

/** RHF's async validation must finish or report failure before leaving the DOM callback. */
export function submitForm(submission: Promise<void>, failureMessage: string): void {
  void submission.catch(() => {
    toast.error(failureMessage)
  })
}
