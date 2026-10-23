<?php

$xml = simplexml_load_file("0000.DUNGEON [Dungeon].xml");

echo '<pre>';
//print_r($xml['@attributes']);
print_r($xml);
echo '</pre>';