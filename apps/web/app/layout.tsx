import type {Metadata} from 'next';
import './globals.css';
import './modern.css';
export const metadata:Metadata={title:'ExitNow — A better way through',description:'A clearer way through New York. Compare transit routes, explore the city and contribute verified rider observations.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
