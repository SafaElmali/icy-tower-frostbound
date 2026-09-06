import bpy, math, random, os
from mathutils import Vector
random.seed(14)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
base=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def material(name,color,metal=0,rough=.6):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    return m
orange=material('Burnt sienna expedition cloth',(.67,.175,.051),0,.82)
lightorange=material('Raised parka stitching',(.87,.30,.095),0,.78)
dark=material('Midnight technical trousers',(.028,.063,.078),0,.76)
rubber=material('Black rubber soles',(.015,.022,.027),0,.85)
cream=material('Ivory lambswool fleece',(.77,.73,.61),0,.98)
canvas=material('Forest canvas backpack',(.14,.23,.22),0,.9)
strap=material('Worn leather straps',(.20,.105,.057),0,.7)
metal=material('Brushed gunmetal fittings',(.25,.31,.32),.8,.28)
zipper=material('Zipper teeth',(.61,.57,.45),.75,.32)
face=material('Warm skin',(.68,.40,.24),0,.82)
glass=material('Amber glacier lenses',(.42,.19,.035),.82,.14)
scarfmat=material('Faded vermilion scarf',(.53,.078,.034),0,.96)
white=material('Summit patch',(.79,.83,.76),0,.7)
root=bpy.data.objects.new('Climber',None); bpy.context.collection.objects.link(root)
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
sphere('Padded parka shell',(0,0,.83),(.31,.21,.34),orange)
for z in [.63,.78,.94,1.06]:
    # Puffed horizontal baffles create a tailored silhouette.
    sphere('Quilted down baffle',(0,-.006,z),(.306,.212,.087),orange)
box('Parka hem',(0,0,.555),(.50,.35,.055),dark,bevel=.02)
box('Central storm flap',(0,-.211,.84),(.034,.023,.48),lightorange,bevel=.008)
for z in [.65+i*.023 for i in range(17)]:box('Zipper stitch',(0,-.228,z),(.019,.008,.007),zipper,bevel=.001)
box('Zipper pull',(0,-.244,1.025),(.03,.015,.06),metal,bevel=.008)
for s in [-1,1]:
    p=box('Handwarmer pocket',(s*.185,-.18,.72),(.115,.033,.145),lightorange,bevel=.025);p.rotation_euler[1]=s*-.17
    rod('Pocket zipper',(s*.14,-.208,.78),(s*.23,-.18,.73),.008,zipper)
    # Stitched harness and backpack straps.
    rod('Shoulder strap',(s*.19,-.153,1.10),(s*.24,-.19,.77),.025,canvas)
    box('Strap buckle',(s*.238,-.218,.8),(.058,.025,.064),metal,bevel=.008)
# Large hood surrounding an inset face, with individual fleece tufts.
sphere('Insulated hood',(0,.015,1.27),(.32,.255,.33),orange)
sphere('Dark hood interior',(0,-.177,1.28),(.251,.087,.246),dark)
sphere('Face',(0,-.217,1.26),(.189,.066,.195),face)
for i in range(32):
    a=i/32*math.tau
    sphere('Fleece hood rim',(math.sin(a)*.247,-.203,1.285+math.cos(a)*.253),(.054+random.random()*.009,.051,.058),cream,segments=12,rings=8)
sphere('Nose',(0,-.284,1.235),(.037,.035,.036),face,segments=16,rings=12)
rod('Goggle strap',(-.25,-.18,1.32),(.25,-.18,1.32),.036,dark)
for s in [-1,1]:
    box('Goggle frame',(s*.098,-.278,1.332),(.187,.055,.126),dark,bevel=.035)
    box('Amber double lens',(s*.098,-.312,1.335),(.149,.018,.092),glass,bevel=.028)
    box('Lens edge glint',(s*.098,-.323,1.365),(.105,.004,.006),zipper,bevel=.002)
box('Goggle bridge',(0,-.311,1.332),(.05,.025,.031),metal,bevel=.006)
# Scarf wrapped under the hood.
for z in [1.052,1.079,1.104]:
    sphere('Scarf wrap',(0,-.01,z),(.26,.231,.034),scarfmat)
scarf=empty('ScarfTail',(.17,.10,1.09))
box('Hanging wool scarf',(.045,.12,-.16),(.13,.035,.34),scarfmat,scarf,bevel=.018)
for x in [0,.03,.06,.09]:rod('Scarf fringe',(x,.12,-.325),(x+.007,.12,-.39),.006,scarfmat,scarf)
# Rugged backpack with a rolled sleeping mat and external climbing tool.
box('Canvas pack',(0,.25,.85),(.46,.23,.48),canvas,bevel=.065)
box('Pack lid',(0,.26,1.09),(.49,.27,.12),canvas,bevel=.045)
box('Pack front pocket',(0,.392,.82),(.29,.05,.21),orange,bevel=.025)
for s in [-1,1]:
    box('Pack webbing',(s*.15,.398,.88),(.035,.027,.43),strap,bevel=.006)
    box('Pack clasp',(s*.15,.419,.94),(.063,.023,.074),metal,bevel=.008)
roll=rod('Sleeping mat',(-.28,.29,1.19),(.28,.29,1.19),.085,cream)
for s in [-1,1]:rod('Mat retaining band',(s*.19,.29,1.10),(s*.19,.29,1.27),.018,strap)
rod('Ice axe shaft',(.28,.24,.53),(.29,.27,1.18),.02,metal)
rod('Ice axe pick',(.29,.27,1.18),(.45,.24,1.14),.023,metal)
# Local pivots allow runtime animation without skeleton overhead.
for s,side in [(-1,'L'),(1,'R')]:
    leg=empty('Leg_'+side,(s*.145,0,.55))
    sphere('Trouser thigh',(0,.0,-.14),(.122,.134,.205),dark,leg)
    sphere('Trouser shin',(0,-.006,-.34),(.099,.115,.143),dark,leg)
    box('Reinforced knee',(0,-.114,-.23),(.142,.052,.13),canvas,leg,bevel=.029)
    box('Leather mountaineering boot',(0,-.062,-.433),(.236,.332,.178),strap,leg,bevel=.055)
    box('Toe guard',(0,-.179,-.44),(.237,.118,.12),rubber,leg,bevel=.027)
    box('Vibram sole',(0,-.062,-.513),(.249,.35,.048),rubber,leg,bevel=.014)
    for j in range(3):
        rod('Boot laces',(-.078,-.126+j*.04,-.356),(.078,-.126+j*.04,-.356),.008,cream,leg)
    for x in [-.09,.09]:
        for y in [-.17,-.04,.07]:box('Crampon tooth',(x,y,-.54),(.025,.039,.029),metal,leg,bevel=.003)
    arm=empty('Arm_'+side,(s*.292,0,1.00))
    sphere('Parka upper sleeve',(s*.022,0,-.10),(.131,.137,.208),orange,arm)
    sphere('Parka lower sleeve',(s*.045,-.012,-.275),(.107,.114,.143),orange,arm)
    sphere('Dark cuff',(s*.046,-.015,-.364),(.106,.108,.045),dark,arm)
    sphere('Leather mitten',(s*.047,-.03,-.428),(.092,.103,.097),strap,arm)
    sphere('Mitten thumb',(s*-.021,-.06,-.411),(.043,.056,.059),strap,arm)
    if s==-1:
        box('Expedition sleeve patch',(-.118,-.058,-.103),(.025,.108,.121),white,arm,bevel=.008)
# Join geometry per pivot, retaining materials and animateable hierarchy.
for parent in [body,scarf]+[o for o in bpy.data.objects if o.name in ['Leg_L','Leg_R','Arm_L','Arm_R']]:
    meshes=[o for o in bpy.data.objects if o.parent==parent and o.type=='MESH']
    if not meshes:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=parent.name+'_Mesh'
# Export only asset, leaving a useful native Blender source alongside it.
bpy.ops.object.select_all(action='SELECT')
os.makedirs(base+'/public/assets',exist_ok=True)
bpy.ops.export_scene.gltf(filepath=base+'/public/assets/climber.glb',export_format='GLB',use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=base+'/scripts/climber.blend')
print('CLIMBER_EXPORT_COMPLETE',os.path.getsize(base+'/public/assets/climber.glb'))
