declare namespace JSX {
  interface IntrinsicElements {
    'moov-payment-methods': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      token?: string
      accountID?: string
      paymentMethodTypes?: string[]
      open?: boolean
      onSuccess?: (data: any) => void
      onError?: (data: any) => void
      onCancel?: () => void
      plaid?: {
        env?: string
        onSuccess?: (...args: any[]) => void
        onExit?: (...args: any[]) => void
        onEvent?: (...args: any[]) => void
      }
    }
  }
}