<?php

$dungeon = simplexml_load_file("0000.DUNGEON [Dungeon].xml");

// map 0 = line 14730 in xml
$tile_graphics = array(
	0 => 'W',
	1 => '.',
	2 => 'X',
	3 => 's',
	4 => 'd',
	5 => 't',
);
echo '<pre>';
$map_width = $dungeon->maps->map[0]['width'];
$map_height = $dungeon->maps->map[0]['height'];
//print_r($dungeon->maps->map[0]);
foreach ($dungeon->maps->map[0]->tiles->tile as $tile) {
	if($tile['index'] != 0 && $tile['index'] % $map_width == 0) {
		//echo "\n";
	}
	$x = $tile['index'] % $map_width;
	$y = floor($tile['index'] / $map_width);
	//echo "($x,$y)";
	echo $tile['type'].",";
	//echo $tile_graphics[(int) $tile['type']];
}
echo "\n";
print_r($dungeon->maps->map[0]->tiles->tile);
echo '</pre>';