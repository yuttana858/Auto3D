# Auto3D 0.96.0 candidate: recorded arrays

Recording a macro containing `object.array` creates the copies and captures their staggered drop and visibility on the shared timeline. Non-animated arrays appear at the end of their step. Later steps can use array result references. One Undo reverses the recording and macro operations. The total scene is limited to 100 objects while recording; existing lighting stays in effect.

Copies exist immediately in the scene and are hidden before their reveal on the timeline. Completed changes can remain after a later step fails. Automatic array camera fitting is not recorded; add camera steps separately. General creation, deletion, materials and overlapping macro steps remain future work. See [agent-interface.md](agent-interface.md). Not deployed.
