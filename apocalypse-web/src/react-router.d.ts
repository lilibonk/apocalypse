import 'react-router'
import type { NavigateOptions, To } from 'react-router'

// AppRouter uses BrowserRouter (declarative mode), whose navigate is synchronous.
// React Router documents this mode-specific augmentation for its union return type.
// Revisit this contract before introducing a Data/Framework RouterProvider.
declare module 'react-router' {
  interface NavigateFunction {
    (to: To, options?: NavigateOptions): void
    (delta: number): void
  }
}
