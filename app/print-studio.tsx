import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

type ProductKind = 'Acrylic & Frames' | 'Canvas' | 'Visiting Cards' | 'Brochures' | 'Letterheads' | 'Wedding Cards';
const products: ProductKind[] = ['Acrylic & Frames', 'Canvas', 'Visiting Cards', 'Brochures', 'Letterheads', 'Wedding Cards'];
const templates = ['Elegant', 'Modern', 'Classic', 'Minimal'];
const industries = ['Photography & Events', 'Restaurant & Cafe', 'Retail & Fashion', 'Real Estate', 'Healthcare', 'Education', 'Professional Services', 'Other'];
const options: Record<ProductKind, string[]> = {
  'Acrylic & Frames': ['Acrylic 3mm', 'Acrylic 5mm', 'Acrylic 8mm', 'Black frame', 'Natural wood frame', 'Gold frame'],
  Canvas: ['Canvas 1.5 inch depth', 'Canvas 2 inch depth', 'Gallery wrap'],
  'Visiting Cards': ['Standard', 'Classic', 'UV', 'UV Die Cutting', 'Premium Textured'],
  Brochures: ['A4', 'A8'],
  Letterheads: ['Bond paper', 'Excel Bond'],
  'Wedding Cards': ['6 × 9 inch card + envelope'],
};
const paperOptions: Record<ProductKind, string[]> = {
  'Acrylic & Frames': ['Gloss finish', 'Matte finish'],
  Canvas: ['Matte canvas', 'Textured canvas'],
  'Visiting Cards': ['300 GSM', '350 GSM', '400 GSM'],
  Brochures: ['90 GSM', '100 GSM'],
  Letterheads: ['90 GSM', '100 GSM'],
  'Wedding Cards': ['Premium card stock', 'Textured card stock'],
};
export default function PrintStudioScreen() {
  const [kind, setKind] = useState<ProductKind>('Acrylic & Frames');
  const [spec, setSpec] = useState(options['Acrylic & Frames'][0]);
  const [paper, setPaper] = useState(paperOptions['Acrylic & Frames'][0]);
  const [sides, setSides] = useState('Single side');
  const [industry, setIndustry] = useState(industries[0]);
  const [brand, setBrand] = useState('');
  const [tagline, setTagline] = useState('');
  const [contact, setContact] = useState('');
  const [venue, setVenue] = useState('');
  const [template, setTemplate] = useState('Elegant');
  const [message, setMessage] = useState('');
  const [angle, setAngle] = useState(0);
  const [envelope, setEnvelope] = useState(true);
  const isBusiness = ['Visiting Cards', 'Brochures', 'Letterheads'].includes(kind);
  const isWedding = kind === 'Wedding Cards';
  const isWall = ['Acrylic & Frames', 'Canvas'].includes(kind);
  const title = useMemo(() => brand.trim() || (isWedding ? 'Wedding Invitation' : isBusiness ? 'Your Business' : 'Your Photo'), [brand, isWedding, isBusiness]);
  function changeKind(next: ProductKind) {
    setKind(next); setSpec(options[next][0]); setPaper(paperOptions[next][0]); setMessage('');
  }
  function chooseTemplate(next: string) { setTemplate(next); setMessage('Template selected: ' + next + '. Personalise the details below.'); }
  function prepareOrder() {
    const details = [kind, spec, paper, kind === 'Brochures' ? sides : '', isBusiness ? industry : '', isWedding && envelope ? 'Envelope included' : '', brand].filter(Boolean).join(' · ');
    setMessage('Order draft prepared: ' + details + '. Connect pricing, artwork upload and checkout before accepting live orders.');
  }
  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title: 'Print & Personalise' }} />
      <Text style={s.kicker}>PRINTOVERA • PRINT STUDIO</Text>
      <Text style={s.heading}>Make it yours.</Text>
      <Text style={s.sub}>Choose a product, personalise your design and inspect the preview before ordering.</Text>
      <View style={s.chips}>{products.map(p => <Pressable key={p} onPress={() => changeKind(p)} style={[s.chip, kind === p && s.chipActive]}><Text style={[s.chipText, kind === p && s.chipTextActive]}>{p}</Text></Pressable>)}</View>
      <View style={s.panel}>
        <Text style={s.section}>PRODUCT PREVIEW</Text>
        <View style={s.previewStage}>
          {isWall ? <View style={[s.wallProduct, kind === 'Canvas' ? s.canvasProduct : spec.toLowerCase().includes('frame') ? s.frameProduct : s.acrylicProduct, { transform: [{ perspective: 700 }, { rotateY: angle + 'deg' }, { rotateX: '-3deg' }] }]}>
              <View style={[s.art, kind === 'Canvas' && s.canvasArt, spec.toLowerCase().includes('frame') && s.framedArt]}>
                <Text style={s.artEyebrow}>PRINTOVERA</Text><Text style={s.artTitle}>{title}</Text><Text style={s.artDetail}>{tagline || 'Your memory. Beautifully printed.'}</Text>
              </View>
            </View> :
            <View style={[s.flatProduct, isWedding && s.inviteProduct, kind === 'Visiting Cards' && s.businessCard]}>
              <Text style={s.artEyebrow}>{isWedding ? 'TOGETHER WITH OUR FAMILIES' : industry.toUpperCase()}</Text><Text style={s.artTitle}>{title}</Text><Text style={s.artDetail}>{tagline || (isWedding ? 'Request the pleasure of your company' : 'Your brand, beautifully presented')}</Text><Text style={s.artDetail}>{contact || venue || 'Contact details'}</Text>
            </View>}
        </View>
        {isWall && <View style={s.row}><Pressable style={s.smallButton} onPress={() => setAngle(Math.max(-45, angle - 12))}><Text style={s.smallButtonText}>↶ Rotate</Text></Pressable><Pressable style={s.smallButton} onPress={() => setAngle(Math.min(45, angle + 12))}><Text style={s.smallButtonText}>Rotate ↷</Text></Pressable></View>}
        <Text style={s.hint}>{isWall ? '3D-style depth preview. Rotate to inspect the edge and finish.' : 'Live layout preview updates as you enter your details.'}</Text>
      </View>
      <View style={s.panel}>
        <Text style={s.section}>1 · PRODUCT SPECIFICATIONS</Text>
        <Text style={s.label}>{isWedding ? 'Card size' : 'Product style / size'}</Text>
        <View style={s.options}>{options[kind].map(o => <Pressable key={o} onPress={() => setSpec(o)} style={[s.option, spec === o && s.optionActive]}><Text style={[s.optionText, spec === o && s.optionTextActive]}>{o}</Text></Pressable>)}</View>
        <Text style={s.label}>Paper / finish</Text>
        <View style={s.options}>{paperOptions[kind].map(o => <Pressable key={o} onPress={() => setPaper(o)} style={[s.option, paper === o && s.optionActive]}><Text style={[s.optionText, paper === o && s.optionTextActive]}>{o}</Text></Pressable>)}</View>
        {kind === 'Brochures' && <><Text style={s.label}>Print sides</Text><View style={s.options}>{['Single side', 'Both sides'].map(o => <Pressable key={o} onPress={() => setSides(o)} style={[s.option, sides === o && s.optionActive]}><Text style={[s.optionText, sides === o && s.optionTextActive]}>{o}</Text></Pressable>)}</View></>}
        {isWedding && <Pressable onPress={() => setEnvelope(!envelope)} style={s.checkRow}><Text style={s.optionText}>{envelope ? '☑' : '☐'} Matching envelope included</Text></Pressable>}
        {isBusiness && <><Text style={s.label}>Business category (for relevant templates)</Text><View style={s.options}>{industries.map(o => <Pressable key={o} onPress={() => setIndustry(o)} style={[s.option, industry === o && s.optionActive]}><Text style={[s.optionText, industry === o && s.optionTextActive]}>{o}</Text></Pressable>)}</View></>}
      </View>
      <View style={s.panel}>
        <Text style={s.section}>2 · DESIGN YOURSELF OR CHOOSE A TEMPLATE</Text>
        <View style={s.options}>{templates.map(t => <Pressable key={t} onPress={() => chooseTemplate(t)} style={[s.template, template === t && s.templateActive]}><Text style={[s.templateName, template === t && s.templateNameActive]}>{t}</Text><Text style={s.templateCaption}>{industry}</Text></Pressable>)}</View>
        <Text style={s.label}>{isWedding ? 'Couple names' : isBusiness ? 'Business / brand name' : 'Preview title'}</Text>
        <TextInput value={brand} onChangeText={setBrand} placeholder={isWedding ? 'e.g. Aanya & Rohan' : 'Your name or business'} style={s.input} />
        <Text style={s.label}>{isWedding ? 'Invitation line' : 'Tagline'}</Text>
        <TextInput value={tagline} onChangeText={setTagline} placeholder={isWedding ? 'Together with our families...' : 'A short line about your brand'} style={s.input} />
        <Text style={s.label}>{isWedding ? 'Date / venue' : 'Phone / contact'}</Text>
        <TextInput value={contact} onChangeText={setContact} placeholder={isWedding ? 'Date and time' : 'Phone, email or website'} style={s.input} />
        <TextInput value={venue} onChangeText={setVenue} placeholder={isWedding ? 'Venue / address' : 'Address (optional)'} style={s.input} />
        <Pressable onPress={() => setMessage('Artwork upload is a next integration step: connect file storage and print-file validation before enabling production uploads.')} style={s.secondaryButton}><Text style={s.secondaryText}>＋ Upload my finished design (setup required)</Text></Pressable>
        <Pressable onPress={prepareOrder} style={s.primaryButton}><Text style={s.primaryText}>Prepare order</Text></Pressable>
        {!!message && <Text style={s.message}>{message}</Text>}
      </View>
      <Text style={s.footer}>Prototype screen • Checkout, live pricing, upload storage and print-ready export must be connected before production use.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f4f2eb'},content:{padding:18,paddingBottom:44,maxWidth:860,width:'100%',alignSelf:'center'},
  kicker:{fontSize:10,letterSpacing:2,color:'#71806d',fontWeight:'700',marginTop:8},heading:{fontSize:36,color:'#203b30',fontFamily:'serif',marginTop:8},sub:{fontSize:14,lineHeight:21,color:'#68746b',marginTop:6,marginBottom:18},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16},chip:{borderWidth:1,borderColor:'#d8ddd4',borderRadius:24,paddingVertical:9,paddingHorizontal:12,backgroundColor:'#fff'},chipActive:{backgroundColor:'#244a39',borderColor:'#244a39'},chipText:{fontSize:12,color:'#425247'},chipTextActive:{color:'#fff'},
  panel:{backgroundColor:'#fff',borderRadius:14,padding:16,marginBottom:14,borderWidth:1,borderColor:'#e4e6df'},section:{fontSize:10,letterSpacing:1.7,fontWeight:'800',color:'#9a7a44',marginBottom:12},previewStage:{minHeight:265,borderRadius:10,backgroundColor:'#29332f',alignItems:'center',justifyContent:'center',overflow:'hidden',padding:28},
  wallProduct:{width:'78%',aspectRatio:1.25,backgroundColor:'#d8e8e8',padding:7,shadowColor:'#000',shadowOpacity:.45,shadowRadius:18,shadowOffset:{width:14,height:18},elevation:14},acrylicProduct:{borderWidth:3,borderColor:'#d7eeee'},canvasProduct:{backgroundColor:'#bba184',padding:12},frameProduct:{backgroundColor:'#282721',padding:13,borderWidth:3,borderColor:'#8d7953'},art:{flex:1,backgroundColor:'#e8e0cf',alignItems:'center',justifyContent:'center',padding:12},canvasArt:{backgroundColor:'#f0e7d8'},framedArt:{borderWidth:2,borderColor:'#c4a96c',backgroundColor:'#f7f1e4'},artEyebrow:{fontSize:8,letterSpacing:2,color:'#8a7045',textAlign:'center'},artTitle:{fontSize:24,fontFamily:'serif',fontStyle:'italic',color:'#2b4738',textAlign:'center',marginVertical:12},artDetail:{fontSize:10,color:'#59655a',textAlign:'center',marginTop:4},
  flatProduct:{width:'78%',minHeight:170,backgroundColor:'#f8f1e5',borderWidth:1,borderColor:'#c9ad78',alignItems:'center',justifyContent:'center',padding:20},inviteProduct:{minHeight:205,borderWidth:5,borderColor:'#c5a56a'},businessCard:{aspectRatio:1.7,minHeight:130,backgroundColor:'#243d32',borderColor:'#b99a5b'},row:{flexDirection:'row',gap:8,justifyContent:'center',marginTop:12},smallButton:{padding:9,borderRadius:7,backgroundColor:'#eef0e9'},smallButtonText:{fontSize:12,color:'#354b3c'},hint:{fontSize:11,color:'#aeb9b0',textAlign:'center',marginTop:10},
  label:{fontSize:12,fontWeight:'700',color:'#34473a',marginTop:12,marginBottom:7},options:{flexDirection:'row',flexWrap:'wrap',gap:8},option:{borderWidth:1,borderColor:'#dfe3db',borderRadius:7,paddingVertical:9,paddingHorizontal:11,backgroundColor:'#fff'},optionActive:{backgroundColor:'#e9f0e9',borderColor:'#466d52'},optionText:{fontSize:12,color:'#45564a'},optionTextActive:{color:'#234a34',fontWeight:'700'},checkRow:{paddingVertical:12},template:{flexGrow:1,minWidth:125,borderRadius:8,padding:13,backgroundColor:'#f7f2e8',borderWidth:1,borderColor:'#e3d6c0'},templateActive:{borderColor:'#9b7b45',backgroundColor:'#f1e6d2'},templateName:{fontSize:16,fontFamily:'serif',color:'#394b3e'},templateNameActive:{fontWeight:'700'},templateCaption:{fontSize:9,color:'#8b9187',marginTop:5},
  input:{borderWidth:1,borderColor:'#e0e4dc',borderRadius:7,paddingHorizontal:12,paddingVertical:11,fontSize:13,marginBottom:9,color:'#25392d',backgroundColor:'#fff'},secondaryButton:{borderWidth:1,borderColor:'#aebcae',borderRadius:8,padding:12,alignItems:'center',marginTop:4},secondaryText:{fontSize:12,color:'#375842',fontWeight:'600'},primaryButton:{backgroundColor:'#244a39',borderRadius:8,padding:14,alignItems:'center',marginTop:10},primaryText:{color:'#fff',fontSize:13,fontWeight:'700'},message:{marginTop:12,padding:11,backgroundColor:'#edf3eb',borderRadius:7,color:'#375842',fontSize:12,lineHeight:18},footer:{fontSize:10,color:'#899087',lineHeight:16,marginTop:2}
});
