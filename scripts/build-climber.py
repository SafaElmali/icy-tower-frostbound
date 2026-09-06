import bpy, math, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
base=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def material(name,color,metal=0,rough=.6):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
blue=material('Harold blue knit beanie',(.035,.18,.49),0,.87)
blueLight=material('Raised knit ribs',(.055,.235,.57),0,.93)
blueDark=material('Beanie fold seams',(.018,.083,.24),0,.92)
green=material('Classic bright green sweatshirt',(.032,.53,.043),0,.88)
greenDark=material('Sweatshirt ribbed trim',(.012,.24,.018),0,.94)
olive=material('Baggy olive trousers',(.23,.25,.075),0,.92)
oliveDark=material('Trouser seams',(.12,.13,.032),0,.95)
brown=material('Brown skate shoes',(.26,.103,.038),0,.72)
rubber=material('Dark rubber soles',(.028,.019,.013),0,.92)
skin=material('Warm cartoon skin',(.87,.48,.235),0,.8)
earShade=material('Ear inner shade',(.56,.245,.115),0,.88)
black=material('Smile',(.031,.013,.009),0,.85)
gold=material('Yellow crown and beanie badge',(.88,.64,.07),.15,.56)
root=bpy.data.objects.new('Harold',None); bpy.context.collection.objects.link(root)
def empty(name,loc,parent=root):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=loc; o.parent=parent; return o
body=empty('Body',(0,0,0))
def sphere(name,loc,scale,mat,parent=body,segments=24,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings)
    o=bpy.context.object; o.name=name; o.parent=parent; o.location=loc; o.scale=scale; o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o
def box(name,loc,scale,mat,parent=body,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1); o=bpy.context.object; o.name=name; o.parent=parent; o.location=loc; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel; mod.segments=3
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def rod(name,a,b,radius,mat,parent=body):
    a,b=Vector(a),Vector(b); d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=d.length)
    o=bpy.context.object; o.name=name; o.parent=parent; o.location=(a+b)/2; o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    return o
# Harold's oversized green sweatshirt and low, rounded silhouette.
sphere('Loose green sweatshirt',(0,0,.70),(.303,.213,.255),green)
box('Ribbed sweatshirt hem',(0,-.001,.499),(.49,.354,.064),greenDark,bevel=.025)
sphere('Neck',(0,0,.92),(.12,.12,.12),skin)
sphere('Sweatshirt collar',(0,0,.898),(.176,.162,.048),greenDark)
# Wide face, large ears, and a big nose visible below the hat. Eyes stay hidden.
sphere('Wide smiling face',(0,-.035,1.082),(.311,.247,.223),skin,segments=40,rings=24)
for s in [-1,1]:
    sphere('Large ear',(s*.303,-.014,1.096),(.094,.075,.111),skin)
    sphere('Inner ear',(s*.336,-.072,1.094),(.046,.014,.063),earShade,segments=16,rings=12)
sphere('Signature round nose',(0,-.275,1.108),(.104,.074,.079),skin,segments=32,rings=20)
# A shallow smile ribbon follows the face, leaving a broad friendly grin.
smile=[]
for i in range(25):
    x=-.193+i*.386/24
    z=1.005+.044*(x/.193)**2
    y=-.035-.247*math.sqrt(max(.1,1-(x/.311)**2-((z-1.082)/.223)**2))-.003
    smile.append((x,y,z))
for i in range(len(smile)-1):rod('Wide curved grin',smile[i],smile[i+1],.010,black)
# Sculpted asymmetrical beanie, with a bent/slouched top rather than a helmet.
rings=[(1.137,.337,0),(1.195,.342,0),(1.29,.315,-.008),(1.38,.282,-.025),(1.44,.262,-.046),(1.46,.229,-.065),(1.50,.233,-.081),(1.57,.198,-.098),(1.626,.151,-.121),(1.65,.075,-.134),(1.654,.004,-.14)]
vertices=[];faces=[];n=64
for z,r,lean in rings:
    for i in range(n):
        a=i/n*math.tau
        ripple=1+.008*math.cos(a*16)
        vertices.append((math.cos(a)*r*ripple+lean,math.sin(a)*r*.83*ripple+.017,z))
for j in range(len(rings)-1):
    for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
mesh=bpy.data.meshes.new('Slouched beanie surface');mesh.from_pydata(vertices,[],faces);mesh.update()
hat=bpy.data.objects.new('Tall slouchy blue beanie',mesh);bpy.context.collection.objects.link(hat);hat.parent=body;hat.data.materials.append(blue)
for face in mesh.polygons:face.use_smooth=True
mod=hat.modifiers.new('Smooth fabric silhouette','SUBSURF');mod.levels=1;bpy.context.view_layer.objects.active=hat;bpy.ops.object.modifier_apply(modifier=mod.name)
# Thick rolled band dips over the eyes, with small knitted ribs.
for z,r in [(1.152,.339),(1.207,.34)]:
    points=[]
    for i in range(65):
        a=i/64*math.tau;points.append((math.cos(a)*r,math.sin(a)*r*.84+.017,z+.014*math.cos(a*2)))
    for i in range(64):rod('Rolled beanie edge',points[i],points[i+1],.028,blue)
for i in range(56):
    a=i/56*math.tau;x=math.cos(a)*.343;y=math.sin(a)*.288+.017
    rod('Knit cuff rib',(x,y,1.157+.014*math.cos(a*2)),(x,y,1.202+.014*math.cos(a*2)),.006,blueLight)
# Tiny yellow paw badge on the beanie, matching the classic palette.
sphere('Paw badge pad',(-.151,-.253,1.185),(.018,.008,.018),gold,segments=12,rings=8)
for x,z in [(-.175,1.208),(-.151,1.215),(-.128,1.207)]:sphere('Paw badge toe',(x,-.253,z),(.008,.007,.009),gold,segments=12,rings=8)
# A raised three-point crown badge on the sweatshirt.
outline=[(-.094,.70),(-.116,.79),(-.045,.761),(0,.825),(.045,.761),(.116,.79),(.094,.70)]
verts=[(x,y,z) for y in [-.215,-.227] for x,z in outline];nn=len(outline)
faces=[tuple(range(nn-1,-1,-1)),tuple(range(nn,2*nn))]+[(i,(i+1)%nn,(i+1)%nn+nn,i+nn) for i in range(nn)]
m=bpy.data.meshes.new('Crown badge');m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new('Classic yellow crown emblem',m);bpy.context.collection.objects.link(o);o.parent=body;o.data.materials.append(gold)
# Separate limbs retain the same animation pivots as the first model.
for s,side in [(-1,'L'),(1,'R')]:
    leg=empty('Leg_'+side,(s*.142,0,.49))
    sphere('Baggy trouser leg',(0,.006,-.145),(.139,.145,.20),olive,leg)
    box('Wide trouser cuff',(0,-.008,-.276),(.251,.244,.061),oliveDark,leg,bevel=.022)
    sphere('Brown round-toe shoe',(0,-.066,-.369),(.151,.206,.101),brown,leg)
    box('Dark skate sole',(0,-.065,-.451),(.293,.383,.048),rubber,leg,bevel=.027)
    sphere('Worn toe highlight',(0,-.18,-.346),(.098,.08,.014),brown,leg)
    arm=empty('Arm_'+side,(s*.281,0,.824))
    sphere('Loose sweatshirt upper sleeve',(s*.035,0,-.089),(.12,.133,.164),green,arm)
    sphere('Loose sweatshirt lower sleeve',(s*.06,-.014,-.222),(.094,.11,.131),green,arm)
    sphere('Ribbed sleeve cuff',(s*.064,-.02,-.310),(.085,.099,.04),greenDark,arm)
    sphere('Small hand',(s*.064,-.022,-.355),(.073,.084,.065),skin,arm)
# Join per pivot for efficient rendering without losing articulated movement.
for parent in [body]+[o for o in bpy.data.objects if o.name in ['Leg_L','Leg_R','Arm_L','Arm_R']]:
    meshes=[o for o in bpy.data.objects if o.parent==parent and o.type=='MESH']
    if not meshes:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=parent.name+'_Mesh'
bpy.ops.object.select_all(action='SELECT')
os.makedirs(base+'/public/assets',exist_ok=True)
bpy.ops.export_scene.gltf(filepath=base+'/public/assets/harold.glb',export_format='GLB',use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=base+'/scripts/climber.blend')
print('HAROLD_EXPORT_COMPLETE',os.path.getsize(base+'/public/assets/harold.glb'))
