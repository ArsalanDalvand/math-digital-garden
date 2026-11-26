import {useRef} from 'react';
import {useStore} from '@nanostores/react';
import {DirectionProvider} from '@base-ui/react/direction-provider';
import {Sheet,SheetTrigger,SheetContent,SheetHeader,SheetTitle,SheetDescription} from './ui/sheet';
import {Button} from './ui/button';
import {PanelLeft} from 'lucide-react';
import {$graphUi} from '../stores/garden';
export default function MobileStudyTools(){
 const graphUi=useStore($graphUi);
 const original=useRef<HTMLElement|null>(null);const content=useRef<HTMLElement|null>(null);
 function mount(node:HTMLDivElement|null){if(node){const host=document.querySelector<HTMLElement>('.workspace-tools');const body=host?.firstElementChild as HTMLElement|null;if(body){original.current=host!;content.current=body;node.append(body);}}else if(original.current&&content.current){original.current.append(content.current);}}
 return <DirectionProvider direction="rtl"><div className="mobile-study-trigger"><Sheet modal={!graphUi.isFullscreen}><SheetTrigger render={<Button variant="ghost" aria-label="ابزارهای مطالعه" title="ابزارهای مطالعه"/>}><PanelLeft size={18} aria-hidden="true"/></SheetTrigger><SheetContent side="left" className="mobile-study-sheet"><SheetHeader><SheetTitle>ابزارهای مطالعه</SheetTitle><SheetDescription>مرور گراف ارتباط یادداشت‌ها</SheetDescription></SheetHeader><div ref={mount} className="mobile-study-body"/></SheetContent></Sheet></div></DirectionProvider>;
}
