import React, { useMemo, useState } from "react";
import { Alert, Image, ScrollView, View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";

type Kind = "Acrylic Photo" | "Framed Photo" | "Canvas Print" | "Photo Collage" | "Photo Prints" | "Visiting Cards" | "Brochures" | "Letterheads" | "Wedding Cards";
const kinds: Kind[] = ["Framed Photo", "Acrylic Photo", "Canvas Print", "Photo Collage", "Photo Prints", "Visiting Cards", "Brochures", "Letterheads", "Wedding Cards"];
const frameColours: Record<string,string> = {"Black":"#242424","Natural oak":"#b99465","Walnut":"#68452f","Gold":"#c7a45b","White":"#f4f1e9","Silver":"#a8adb1"};
const printSizes = ["4 × 6 in","5 × 7 in","8 × 10 in","8 × 12 in","12 × 16 in","12 × 18 in","16 × 20 in","20 × 24 in"];
const categories = ["Photography & Events", "Restaurant & Cafe", "Retail & Fashion", "Real Estate", "Healthcare", "Education", "Professional Services", "Other"];
const variants: Record<Kind,string[]> = {
 "Acrylic Photo":["3mm acrylic","5mm acrylic","8mm acrylic"],
 "Framed Photo":["Black frame","Natural wood frame","Gold frame","White frame"],
 "Canvas Print":["1.5 inch gallery wrap","2 inch gallery wrap","Slim wrap"],
 "Photo Collage":["Classic grid","Gallery wall","Heart collage","Polaroid collage","Free layout"],
 "Photo Prints":["4 × 6 in","5 × 7 in","8 × 10 in","8 × 12 in","12 × 18 in"],
 "Visiting Cards":["Standard","Classic","UV","UV Die Cutting","Premium Textured"],
 "Brochures":["A4","A8"],
 "Letterheads":["Bond","Excel Bond"],
 "Wedding Cards":["6 × 9 inch"],
};
const finishes: Record<Kind,string[]> = {
 "Acrylic Photo":["Gloss","Matte"], "Framed Photo":["Gloss photo","Matte photo"],
 "Canvas Print":["Matte canvas","Textured canvas"],
 "Photo Collage":["Matte photo paper","Gloss photo paper","Canvas"],
 "Photo Prints":["Gloss","Matte","Lustre"],
 "Visiting Cards":["300 GSM","350 GSM","400 GSM"],
 "Brochures":["90 GSM","100 GSM"], "Letterheads":["Bond paper","Excel Bond paper"],
 "Wedding Cards":["Premium card stock","Textured card stock"],
};
const templates = ["Elegant","Modern","Classic","Minimal","Luxury"];
export default function PrintStudioScreen() {
 const [kind,setKind] = useState<Kind>("Acrylic Photo");
 const [variant,setVariant] = useState(variants["Acrylic Photo"][0]);
 const [finish,setFinish] = useState(finishes["Acrylic Photo"][0]);
 const [category,setCategory] = useState(categories[0]);
 const [template,setTemplate] = useState("Elegant");
 const [photo,setPhoto] = useState<string|null>(null);
 const [photoUris,setPhotoUris] = useState<string[]>([]);
 const [frameColour,setFrameColour] = useState("Black");
 const [productSize,setProductSize] = useState("8 × 10 in");
 const [quantity,setQuantity] = useState("1");
 const [brand,setBrand] = useState("");
 const [tagline,setTagline] = useState("");
 const [contact,setContact] = useState("");
 const [date,setDate] = useState("");
 const [venue,setVenue] = useState("");
 const [sides,setSides] = useState("Single side");
 const [envelope,setEnvelope] = useState(true);
 const [angle,setAngle] = useState(-5);
 const [message,setMessage] = useState("");
 const wall = ["Acrylic Photo","Framed Photo","Canvas Print","Photo Collage"].includes(kind);
 const business = ["Visiting Cards","Brochures","Letterheads"].includes(kind);
 const wedding = kind === "Wedding Cards";
 const title = useMemo(()=>brand.trim() || (wedding ? "A Wedding Invitation" : business ? "YOUR BUSINESS" : "Your Photo"),[brand,wedding,business]);
 function changeKind(next:Kind) { setKind(next); setVariant(variants[next][0]); setFinish(finishes[next][0]); setMessage(""); }
 async function pickArtwork() {
   const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsEditing:kind!=="Photo Collage",allowsMultipleSelection:kind==="Photo Collage",selectionLimit:20,quality:1});
   if (!result.canceled && result.assets?.length) {
     const uris = result.assets.map(a=>a.uri).filter(Boolean);
     if (kind==="Photo Collage") { setPhotoUris(uris); setPhoto(uris[0]||null); setMessage(`${uris.length} photos added to the collage preview. Secure production upload is not connected yet.`); }
     else { setPhoto(uris[0]); setPhotoUris(uris.slice(0,1)); setMessage("Artwork loaded into the preview. Secure production upload still requires storage integration."); }
   }
 }
 function orderDraft() {
   if (business && !brand.trim()) { setMessage("Add your business name to personalise the design."); return; }
   if (wedding && !brand.trim()) { setMessage("Add the couple's names to personalise the invitation."); return; }
   const data = [kind,variant,kind==="Framed Photo" ? `Moulding: ${frameColour}` : "",["Framed Photo","Photo Prints"].includes(kind) ? `Size: ${productSize}` : "",kind==="Photo Prints" ? `Quantity: ${quantity||1}` : "",finish,business ? category : "",kind==="Brochures" ? sides : "",wedding ? (envelope ? "Envelope included" : "No envelope") : "",brand,tagline,contact,date,venue,template].filter(Boolean).join(" • ");
   setMessage("Order draft prepared: "+data+". Live pricing, print-ready export, cart and payment must be connected before taking real orders.");
 }
 return <ScrollView style={st.page} contentContainerStyle={st.content}>
  <Stack.Screen options={{title:"Printovera Print Studio",headerShown:true}} />
  <Text style={st.kicker}>PRINTOVERA · CUSTOM PRINTS</Text>
  <Text style={st.heading}>Made personal. Made to last.</Text>
  <Text style={st.sub}>Choose your product, upload artwork or personalise a template, and preview it before preparing an order.</Text>
  <View style={st.chips}>{kinds.map(k=><Pressable key={k} onPress={()=>changeKind(k)} style={[st.chip,kind===k&&st.chipOn]}><Text style={[st.chipText,kind===k&&st.chipTextOn]}>{k}</Text></Pressable>)}</View>
  <View style={st.panel}>
   <Text style={st.section}>LIVE PRODUCT PREVIEW</Text>
   <View style={st.stage}>
    {wall ? <View style={[st.wall,{transform:[{perspective:700},{rotateY:angle+"deg"},{rotateX:"-3deg"}]},kind==="Acrylic Photo"?st.acrylic:kind==="Framed Photo"?[st.frame,{borderColor:frameColours[frameColour]}]:kind==="Photo Collage"?st.collageFrame:st.canvas]}>
      <View style={[st.art,kind==="Canvas Print"&&st.canvasArt]}>
       {kind==="Photo Collage" && photoUris.length>0 ? <View style={st.collageGrid}>{photoUris.slice(0,9).map((uri,i)=><Image key={uri+i} source={{uri}} style={st.collagePhoto} resizeMode="cover"/> )}</View> : photo ? <Image source={{uri:photo}} style={st.photo} resizeMode="cover"/> : <View style={st.placeholder}><Text style={st.artSmall}>YOUR PHOTO</Text><Text style={st.artTitle}>{title}</Text><Text style={st.artDetail}>{tagline||"A memory worth displaying"}</Text></View>}
      </View>
      {kind==="Acrylic Photo" && finish==="Gloss" && <View pointerEvents="none" style={st.acrylicGlossOverlay}>
        <View style={st.acrylicTopGlint}/>
        <View style={st.acrylicReflectionBand}/>
        <View style={st.acrylicSideGlint}/>
      </View>}
    </View> : <View style={[st.flat,wedding&&st.invite,kind==="Visiting Cards"&&st.card]}>
      {photo && <Image source={{uri:photo}} style={st.flatPhoto} resizeMode="cover"/>}
      <Text style={st.artSmall}>{wedding?"TOGETHER WITH OUR FAMILIES":business?category.toUpperCase():"PRINTOVERA"}</Text>
      <Text style={st.artTitle}>{title}</Text><Text style={st.artDetail}>{tagline||(wedding?"Request the pleasure of your company":"Thoughtfully designed for you")}</Text>
      {!!contact&&<Text style={st.artDetail}>{contact}</Text>}{!!date&&<Text style={st.artDetail}>{date}</Text>}{!!venue&&<Text style={st.artDetail}>{venue}</Text>}
    </View>}
   </View>
   {wall&&<View style={st.row}><Pressable onPress={()=>setAngle(Math.max(-35,angle-10))} style={st.small}><Text style={st.smallText}>↶ Rotate</Text></Pressable><Pressable onPress={()=>setAngle(Math.min(35,angle+10))} style={st.small}><Text style={st.smallText}>Rotate ↷</Text></Pressable></View>}
   <Text style={st.hint}>{wall?"Perspective, edge thickness and shadow preview. Rotate to inspect the product.":"Preview updates as you edit the copy and template."}</Text>
  </View>
  <View style={st.panel}><Text style={st.section}>1 · PRODUCT SPECIFICATIONS</Text>
   {kind==="Framed Photo"&&<><Text style={st.label}>Browse frame mouldings</Text><Text style={st.galleryHint}>Choose a moulding below; the preview border changes with your selection.</Text><View style={st.frameGallery}>{Object.keys(frameColours).map(col=><Pressable key={col} onPress={()=>setFrameColour(col)} style={[st.frameSwatch,frameColour===col&&st.frameSwatchOn]}><View style={[st.swatchSample,{backgroundColor:frameColours[col]}]}/><Text style={st.optionText}>{col}</Text></Pressable>)}</View><Text style={st.label}>Frame size</Text><View style={st.options}>{printSizes.map(s=><Pressable key={s} onPress={()=>setProductSize(s)} style={[st.option,productSize===s&&st.optionOn]}><Text style={st.optionText}>{s}</Text></Pressable>)}</View></>}
   {kind==="Photo Prints"&&<><Text style={st.label}>Print size</Text><View style={st.options}>{printSizes.map(s=><Pressable key={s} onPress={()=>setProductSize(s)} style={[st.option,productSize===s&&st.optionOn]}><Text style={st.optionText}>{s}</Text></Pressable>)}</View><Text style={st.label}>Quantity</Text><TextInput value={quantity} onChangeText={v=>setQuantity(v.replace(/[^0-9]/g,"").slice(0,5))} keyboardType="number-pad" placeholder="1" style={st.input}/></>}
   {kind==="Photo Collage"&&<Text style={st.galleryHint}>Upload multiple photos to build a collage preview. Choose a layout above; detailed drag-and-drop layout editing will be added in a later pass.</Text>
   <Text style={st.label}>Style / size</Text><View style={st.options}>{variants[kind].map(v=><Pressable key={v} onPress={()=>setVariant(v)} style={[st.option,variant===v&&st.optionOn]}><Text style={st.optionText}>{v}</Text></Pressable>)}</View>
   <Text style={st.label}>Paper / finish</Text><View style={st.options}>{finishes[kind].map(v=><Pressable key={v} onPress={()=>setFinish(v)} style={[st.option,finish===v&&st.optionOn]}><Text style={st.optionText}>{v}</Text></Pressable>)}</View>
   {kind==="Brochures"&&<><Text style={st.label}>Printing sides</Text><View style={st.options}>{["Single side","Both sides"].map(v=><Pressable key={v} onPress={()=>setSides(v)} style={[st.option,sides===v&&st.optionOn]}><Text style={st.optionText}>{v}</Text></Pressable>)}</View></>}
   {wedding&&<Pressable onPress={()=>setEnvelope(!envelope)} style={st.small}><Text style={st.smallText}>{envelope?"☑":"☐"} Matching envelope included</Text></Pressable>}
   {business&&<><Text style={st.label}>Business category</Text><View style={st.options}>{categories.map(c=><Pressable key={c} onPress={()=>setCategory(c)} style={[st.option,category===c&&st.optionOn]}><Text style={st.optionText}>{c}</Text></Pressable>)}</View></>}
  </View>
  <View style={st.panel}><Text style={st.section}>2 · UPLOAD OR DESIGN YOURSELF</Text>
   <Pressable onPress={pickArtwork} style={st.secondary}><Text style={st.secondaryText}>{photo?"✓ Replace uploaded artwork":"＋ Upload photo / finished design"}</Text></Pressable>
   <Text style={st.label}>Choose a template</Text><View style={st.options}>{templates.map(t=><Pressable key={t} onPress={()=>{setTemplate(t);setMessage("Selected "+t+" template. Edit the fields below.");}} style={[st.template,template===t&&st.templateOn]}><Text style={st.templateTitle}>{t}</Text><Text style={st.templateSub}>{category}</Text></Pressable>)}</View>
   <Text style={st.label}>{wedding?"Couple names":business?"Business name":"Preview title"}</Text><TextInput value={brand} onChangeText={setBrand} placeholder={wedding?"e.g. Aanya & Rohan":"Your brand or title"} style={st.input}/>
   <Text style={st.label}>{wedding?"Invitation wording":"Tagline / message"}</Text><TextInput value={tagline} onChangeText={setTagline} placeholder="Enter your text" style={st.input}/>
   <Text style={st.label}>{wedding?"Date and time":"Contact details"}</Text><TextInput value={contact} onChangeText={setContact} placeholder={wedding?"Date and time":"Phone, email or website"} style={st.input}/>
   {wedding&&<><Text style={st.label}>Wedding date</Text><TextInput value={date} onChangeText={setDate} placeholder="Date" style={st.input}/><Text style={st.label}>Venue</Text><TextInput value={venue} onChangeText={setVenue} placeholder="Venue and address" style={st.input}/></>}
   <Pressable onPress={orderDraft} style={st.primary}><Text style={st.primaryText}>Prepare order</Text></Pressable>
   {!!message&&<Text accessibilityRole="alert" style={st.message}>{message}</Text>}
  </View>
  <Text style={st.footer}>Preview and order-draft prototype. Before accepting real orders, connect secure artwork storage, print-ready export, pricing, cart, payment and order tracking.</Text>
 </ScrollView>;
}
const st=StyleSheet.create({
 page:{flex:1,backgroundColor:"#f4f2eb"},content:{padding:18,paddingBottom:48,maxWidth:900,width:"100%",alignSelf:"center"},
 kicker:{fontSize:10,letterSpacing:2,color:"#71806d",fontWeight:"700",marginTop:8},heading:{fontSize:32,color:"#203b30",fontFamily:"serif",marginTop:8},sub:{fontSize:14,lineHeight:21,color:"#68746b",marginTop:6,marginBottom:18},
 chips:{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:16},chip:{borderWidth:1,borderColor:"#d8ddd4",borderRadius:24,paddingVertical:9,paddingHorizontal:12,backgroundColor:"#fff"},chipOn:{backgroundColor:"#244a39",borderColor:"#244a39"},chipText:{fontSize:12,color:"#425247"},chipTextOn:{color:"#fff"},
 panel:{backgroundColor:"#fff",borderRadius:14,padding:16,marginBottom:14,borderWidth:1,borderColor:"#e4e6df"},section:{fontSize:10,letterSpacing:1.7,fontWeight:"800",color:"#9a7a44",marginBottom:12},
 stage:{minHeight:280,borderRadius:10,backgroundColor:"#29332f",alignItems:"center",justifyContent:"center",overflow:"hidden",padding:28},wall:{width:"82%",aspectRatio:1.25,padding:7,shadowColor:"#000",shadowOpacity:.5,shadowRadius:18,shadowOffset:{width:14,height:18},elevation:14},
 frameGallery:{flexDirection:"row",flexWrap:"wrap",gap:8},frameSwatch:{width:92,padding:8,borderWidth:1,borderColor:"#e0e4dc",borderRadius:8,alignItems:"center",gap:6},frameSwatchOn:{borderColor:"#466d52",backgroundColor:"#edf3eb"},swatchSample:{width:48,height:34,borderWidth:5,borderColor:"#ddd",elevation:3},galleryHint:{fontSize:11,lineHeight:16,color:"#7a847a",marginBottom:8},collageFrame:{backgroundColor:"#f5f0e5",padding:8,borderWidth:7,borderColor:"#b99a5b"},collageGrid:{flex:1,flexDirection:"row",flexWrap:"wrap",gap:3,alignContent:"center",justifyContent:"center"},collagePhoto:{width:"31%",height:"31%",minHeight:30},acrylic:{backgroundColor:"#d8eeee",borderWidth:4,borderColor:"#e4f7fb",shadowColor:"#dffaff",shadowOpacity:.8,shadowRadius:20,shadowOffset:{width:-5,height:-4}},acrylicGlossOverlay:{...StyleSheet.absoluteFillObject,overflow:"hidden",borderWidth:1,borderColor:"rgba(255,255,255,0.9)"},acrylicTopGlint:{position:"absolute",top:2,left:4,right:4,height:3,backgroundColor:"rgba(255,255,255,0.95)",borderRadius:3},acrylicReflectionBand:{position:"absolute",top:"-15%",left:"35%",width:"18%",height:"135%",backgroundColor:"rgba(255,255,255,0.22)",transform:[{rotate:"18deg"}]},acrylicSideGlint:{position:"absolute",top:5,bottom:5,left:2,width:3,backgroundColor:"rgba(255,255,255,0.75)"},frame:{backgroundColor:"#292721",padding:14,borderWidth:4,borderColor:"#a68c59"},canvas:{backgroundColor:"#bba184",padding:13},art:{flex:1,backgroundColor:"#eee5d4",overflow:"hidden"},canvasArt:{backgroundColor:"#f0e7d8"},photo:{width:"100%",height:"100%"},placeholder:{flex:1,alignItems:"center",justifyContent:"center",padding:12},artSmall:{fontSize:8,letterSpacing:2,color:"#9a7b48",textAlign:"center"},artTitle:{fontSize:24,fontFamily:"serif",fontStyle:"italic",color:"#2b4738",textAlign:"center",marginVertical:10},artDetail:{fontSize:10,color:"#59655a",textAlign:"center",marginTop:4},
 flat:{width:"82%",minHeight:180,backgroundColor:"#f8f1e5",borderWidth:1,borderColor:"#c9ad78",alignItems:"center",justifyContent:"center",padding:20,overflow:"hidden"},invite:{minHeight:230,borderWidth:5,borderColor:"#c5a56a"},card:{aspectRatio:1.7,minHeight:140,backgroundColor:"#243d32",borderColor:"#b99a5b"},flatPhoto:{width:100,height:70,marginBottom:10},row:{flexDirection:"row",gap:8,justifyContent:"center",marginTop:12},small:{padding:10,borderRadius:7,backgroundColor:"#eef0e9",alignSelf:"flex-start",marginTop:8},smallText:{fontSize:12,color:"#354b3c"},hint:{fontSize:11,color:"#aeb9b0",textAlign:"center",marginTop:10},label:{fontSize:12,fontWeight:"700",color:"#34473a",marginTop:12,marginBottom:7},options:{flexDirection:"row",flexWrap:"wrap",gap:8},option:{borderWidth:1,borderColor:"#dfe3db",borderRadius:7,paddingVertical:9,paddingHorizontal:11,backgroundColor:"#fff"},optionOn:{backgroundColor:"#e9f0e9",borderColor:"#466d52"},optionText:{fontSize:12,color:"#45564a"},template:{flexGrow:1,minWidth:110,borderRadius:8,padding:12,backgroundColor:"#f7f2e8",borderWidth:1,borderColor:"#e3d6c0"},templateOn:{borderColor:"#9b7b45",backgroundColor:"#f1e6d2"},templateTitle:{fontSize:15,fontFamily:"serif",color:"#394b3e"},templateSub:{fontSize:9,color:"#8b9187",marginTop:5},input:{borderWidth:1,borderColor:"#e0e4dc",borderRadius:7,paddingHorizontal:12,paddingVertical:11,fontSize:13,marginBottom:9,color:"#25392d",backgroundColor:"#fff"},secondary:{borderWidth:1,borderColor:"#aebcae",borderRadius:8,padding:12,alignItems:"center"},secondaryText:{fontSize:12,color:"#375842",fontWeight:"600"},primary:{backgroundColor:"#244a39",borderRadius:8,padding:14,alignItems:"center",marginTop:14},primaryText:{color:"#fff",fontSize:13,fontWeight:"700"},message:{marginTop:12,padding:11,backgroundColor:"#edf3eb",borderRadius:7,color:"#375842",fontSize:12,lineHeight:18},footer:{fontSize:10,color:"#899087",lineHeight:16,marginTop:2}
});
