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

    'moov-onboarding': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      ref?: React.Ref<any>
      token?: string
      facilitatorAccountID?: string
      accountData?: any
      capabilities?: string[]
      open?: boolean
      onResourceCreated?: (data: { resourceType: string; resource: any }) => void
      onSuccess?: (result: any) => void
      onError?: (error: any) => void
      onCancel?: () => void
      plaid?: any
      onPlaidRedirect?: (data: any) => void
      paymentMethodTypes?: string[]
      allowedCardBrands?: string[]
      microDeposits?: boolean
      showLogo?: boolean
    }
  }
}